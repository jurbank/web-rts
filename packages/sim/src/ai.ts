import { researchedOrQueued, type Command } from "./commands.ts";
import { canUseAbility, isEnemy, nearest } from "./systems.ts";
import { distance } from "./world.ts";
import {
  canPlace,
  definitionOf,
  findUpgrade,
  meetsRequirements,
  toTicks,
  type Entity,
  type PlayerState,
  type Point,
  type World,
} from "./world.ts";

/** Ticks between decisions. */
export const AI_INTERVAL = toTicks(1);

const SITE_DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 0.7071, y: 0.7071 },
  { x: -0.7071, y: 0.7071 },
  { x: -0.7071, y: -0.7071 },
  { x: 0.7071, y: -0.7071 },
];

/**
 * Decides what an ai player does next. It reads the world and returns
 * commands, which go through the same queue as a human's (S2).
 */
export function think(world: World, player: PlayerState): Command[] {
  const commands: Command[] = [];
  const base = { playerId: player.id, tick: world.tick };
  const settings = player.ai ?? { workers: 0, attackSize: 1 };
  const own = world.entities.filter((entity) => entity.playerId === player.id);
  const definition = (entity: Entity) => definitionOf(world, entity);
  let budget = player.resources;

  for (const unit of own) {
    if (unit.orders.length > 0 || definition(unit).gatherer === undefined) continue;
    const node = nearest(world, unit, (other) => other.amount > 0);
    if (node !== undefined) {
      commands.push({ ...base, type: "gather", unitIds: [unit.id], nodeId: node.id });
    }
  }

  const isGatherer = (id: string) => world.definitions[id].gatherer !== undefined;
  let workers = 0;
  for (const entity of own) {
    if (isGatherer(entity.definitionId)) workers += 1;
    workers += entity.queue.filter(
      (item) => "definitionId" in item && isGatherer(item.definitionId),
    ).length;
  }
  const unlocked = (id: string) => meetsRequirements(world, player, world.definitions[id].requires);
  // With an army in hand, idle buildings research before they train more.
  const armed = own.filter(
    (entity) => definition(entity).weapon !== undefined && definition(entity).speed !== undefined,
  ).length;
  for (const building of own) {
    if (building.buildRemaining > 0 || building.queue.length > 0) continue;
    if (armed >= settings.attackSize) {
      const upgrade = definition(building)
        .researches.map((id) => findUpgrade(world, id)!)
        .find(
          (each) =>
            each.cost <= budget &&
            researchedOrQueued(world, player.id, each.id) < each.levels &&
            meetsRequirements(world, player, each.requires),
        );
      if (upgrade !== undefined) {
        budget -= upgrade.cost;
        commands.push({
          ...base,
          type: "research",
          buildingId: building.id,
          upgradeId: upgrade.id,
        });
        continue;
      }
    }
    const options = [...definition(building).produces].filter(unlocked);
    for (const offer of building.offers) if (offer !== null && unlocked(offer)) options.push(offer);
    const choice =
      workers < settings.workers
        ? options.find(isGatherer)
        : options.find((id) => world.definitions[id].weapon !== undefined);
    if (choice === undefined || world.definitions[choice].cost > budget) continue;
    budget -= world.definitions[choice].cost;
    if (isGatherer(choice)) workers += 1;
    commands.push({ ...base, type: "produce", buildingId: building.id, definitionId: choice });
  }

  const builder = own.find((entity) => definition(entity).builds.length > 0);
  const home = own.find((entity) => definition(entity).dropOff) ?? own[0];
  if (builder !== undefined && home !== undefined) {
    const wanted = definition(builder).builds.find(
      (id) =>
        !own.some((entity) => entity.definitionId === id) &&
        world.definitions[id].cost <= budget &&
        unlocked(id),
    );
    const site = wanted === undefined ? undefined : findSite(world, home, wanted);
    if (wanted !== undefined && site !== undefined) {
      commands.push({
        ...base,
        type: "build",
        unitIds: [builder.id],
        definitionId: wanted,
        ...site,
      });
    }
  }
  for (const building of own) {
    if (building.buildRemaining === 0) continue;
    const tended = own.some((entity) =>
      entity.orders.some((order) => order.type === "build" && order.buildingId === building.id),
    );
    if (!tended && builder !== undefined) {
      commands.push({ ...base, type: "assist", unitIds: [builder.id], buildingId: building.id });
    }
  }

  for (const unit of own) {
    const { abilities, radius } = definition(unit);
    if (unit.orders[0]?.type === "cast") continue;
    // The first ability that is usable and has a use right now. One with a cost is a purchase.
    for (const [index, ability] of abilities.entries()) {
      if (!canUseAbility(world, unit, index) || ability.cost > budget) continue;
      const cast = { ...base, type: "cast" as const, unitId: unit.id, abilityId: ability.id };
      if (ability.target === "self") {
        if (ability.cost === 0 && unit.orders[0]?.type !== "attack") continue;
        budget -= ability.cost;
        commands.push(cast);
        break;
      }
      const reach = (ability.range ?? 0) + radius;
      const target = nearest(
        world,
        unit,
        (other) =>
          isEnemy(world, unit, other) && distance(unit, other) - definition(other).radius <= reach,
      );
      if (target === undefined) continue;
      budget -= ability.cost;
      commands.push({ ...cast, targetId: target.id });
      break;
    }
  }

  const army = own.filter(
    (entity) =>
      entity.orders.length === 0 &&
      definition(entity).weapon !== undefined &&
      definition(entity).speed !== undefined,
  );
  if (army.length >= settings.attackSize) {
    const target = nearest(world, army[0], (other) => isEnemy(world, army[0], other));
    if (target !== undefined) {
      commands.push({
        ...base,
        type: "attack",
        unitIds: army.map((entity) => entity.id),
        targetId: target.id,
      });
    }
  }
  return commands;
}

/** The first free spot on rings of growing size around `home`. */
function findSite(world: World, home: Entity, definitionId: string): Point | undefined {
  const definition = world.definitions[definitionId];
  const start = definitionOf(world, home).radius + definition.radius + 2;
  for (let ring = start; ring < start + 16; ring += 2) {
    for (const direction of SITE_DIRECTIONS) {
      const x = home.x + direction.x * ring;
      const y = home.y + direction.y * ring;
      if (canPlace(world, definition, x, y)) return { x, y };
    }
  }
  return undefined;
}
