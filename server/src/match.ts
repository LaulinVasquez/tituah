import {
  applyHit,
  applyMovement,
  aabbOverlap,
  clonePlayerState,
  cloneSnapshot,
  DEFAULT_STAGE,
  emptyInput,
  getAttack,
  getChargedAttackValues,
  getBodyAABB,
  getMeleeHitbox,
  isInBlastZone,
  PLAYER_LIVES,
  PLAYER_MAX_HEALTH,
  MAX_JUMPS,
  PRIMARY_ATTACK_ID,
  RESPAWN_INVULN_TIME,
  resolveProjectileHits,
  SNAPSHOT_EVERY_TICKS,
  startAttack as beginAttack,
  releaseAttack as finishAttack,
  syncAttackFromInput,
  TICK_DT,
  updateAttackState,
  updateProjectiles,
  type HitEvent,
  type MatchSnapshot,
  type MatchStatus,
  type PlayerInput,
  type PlayerState,
  type Projectile,
  type ServerMessage,
  type StageMap,
} from "@tituah/shared";

export type MatchEmitter = (playerId: string | null, message: ServerMessage) => void;

interface ActiveHitbox {
  ownerId: string;
  attackId: string;
  charge: number;
  endsAt: number;
  hitPlayerIds: Set<string>;
}

export class Match {
  readonly id: string;
  readonly map: StageMap;
  readonly players = new Map<string, PlayerState>();
  readonly projectiles: Projectile[] = [];
  readonly scores: Record<string, number> = {};

  status: MatchStatus = "waiting";
  tick = 0;
  time = 0;
  winnerId: string | null = null;

  private readonly inputs = new Map<string, PlayerInput>();
  private readonly previousInputs = new Map<string, PlayerInput>();
  private readonly pendingAttackStarts = new Set<string>();
  private readonly pendingAttackReleases = new Set<string>();
  private readonly activeHitboxes: ActiveHitbox[] = [];
  private readonly emit: MatchEmitter;

  constructor(id: string, emit: MatchEmitter, map: StageMap = DEFAULT_STAGE) {
    this.id = id;
    this.emit = emit;
    this.map = map;
  }

  get playerCount(): number {
    return this.players.size;
  }

  addPlayer(id: string, name: string): PlayerState {
    const spawnIndex = this.players.size % this.map.spawns.length;
    const spawn = this.map.spawns[spawnIndex] ?? this.map.spawns[0];
    const player: PlayerState = {
      id,
      name,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      facing: spawnIndex === 0 ? 1 : -1,
      grounded: true,
      jumpsRemaining: MAX_JUMPS,
      health: PLAYER_MAX_HEALTH,
      damagePercent: 0,
      attackState: { type: "idle" },
      lives: PLAYER_LIVES,
      lastInputSeq: 0,
      spawnIndex,
      invulnerableUntil: 0,
    };
    this.players.set(id, player);
    this.scores[id] = 0;
    this.inputs.set(id, emptyInput());
    this.previousInputs.set(id, emptyInput());
    return player;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.inputs.delete(id);
    this.previousInputs.delete(id);
    delete this.scores[id];
    if (this.status === "playing") {
      this.endMatch(this.livingPlayers()[0]?.id ?? null);
    }
  }

  handleInput(playerId: string, input: PlayerInput): void {
    const player = this.players.get(playerId);
    if (!player || this.status !== "playing") return;
    if (input.sequence < player.lastInputSeq) return;
    this.inputs.set(playerId, input);
    player.lastInputSeq = input.sequence;
  }

  startAttack(playerId: string): void {
    this.pendingAttackStarts.add(playerId);
  }

  releaseAttack(playerId: string): void {
    this.pendingAttackReleases.add(playerId);
  }

  start(): void {
    if (this.status !== "waiting") return;
    this.status = "playing";
    this.tick = 0;
    this.time = 0;
    this.resetPlayersToSpawns();
    const snapshot = this.createSnapshot();
    for (const player of this.players.values()) {
      this.emit(player.id, {
        type: "match_started",
        snapshot: cloneSnapshot(snapshot),
        yourId: player.id,
      });
    }
  }

  update(dt = TICK_DT): void {
    if (this.status !== "playing") return;

    this.tick += 1;
    this.time += dt;

    for (const player of this.players.values()) {
      if (player.lives <= 0) continue;
      const input = this.inputs.get(player.id) ?? emptyInput();
      const previous = this.previousInputs.get(player.id) ?? emptyInput();
      applyMovement(player, input, previous, this.map.platforms, dt);
      this.applyAttackIntent(player, input, previous);
      this.previousInputs.set(player.id, input);
    }

    this.resolveAttacks();
    this.updateProjectiles(dt);
    this.resolveCollisions();
    this.checkMatchEnd();

    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) {
      this.broadcastSnapshot();
    }
  }

  resolveAttacks(): void {
    const hits: HitEvent[] = [];

    for (const player of this.players.values()) {
      updateAttackState(player, this.time);
      if (player.attackState.type === "active") {
        this.ensureActiveHitbox(player);
      }
    }

    for (let i = this.activeHitboxes.length - 1; i >= 0; i -= 1) {
      const hitbox = this.activeHitboxes[i];
      const owner = this.players.get(hitbox.ownerId);
      if (!owner || owner.attackState.type !== "active" || this.time >= hitbox.endsAt) {
        this.activeHitboxes.splice(i, 1);
        continue;
      }

      const attack = getAttack(hitbox.attackId);
      const values = getChargedAttackValues(attack, hitbox.charge);
      const box = getMeleeHitbox(owner, values);

      for (const target of this.players.values()) {
        if (target.id === owner.id || target.lives <= 0) continue;
        if (this.time < target.invulnerableUntil) continue;
        if (hitbox.hitPlayerIds.has(target.id)) continue;
        if (!aabbOverlap(box, getBodyAABB(target))) continue;

        hitbox.hitPlayerIds.add(target.id);
        const hit = applyHit(owner, target, values);
        hits.push(hit);
      }
    }

    for (const hit of hits) {
      this.emit(null, { type: "player_hit", ...hit });
    }
  }

  resolveCollisions(): void {
    for (const player of this.players.values()) {
      if (player.lives <= 0) continue;
      if (!isInBlastZone(player, this.map.blast)) continue;
      this.killPlayer(player);
    }
  }

  updateProjectiles(dt: number): void {
    const alive = updateProjectiles(this.projectiles, dt);
    this.projectiles.length = 0;
    const resolved = resolveProjectileHits(alive, [...this.players.values()]);
    this.projectiles.push(...resolved.remaining);
    for (const hit of resolved.hits) {
      this.emit(null, { type: "player_hit", ...hit });
    }
  }

  createSnapshot(): MatchSnapshot {
    const lastProcessedInput: Record<string, number> = {};
    for (const player of this.players.values()) {
      lastProcessedInput[player.id] = player.lastInputSeq;
    }
    return {
      stageId: this.map.id,
      tick: this.tick,
      time: this.time,
      status: this.status,
      players: [...this.players.values()].map(clonePlayerState),
      projectiles: this.projectiles.map((projectile) => ({
        ...projectile,
        position: { ...projectile.position },
        velocity: { ...projectile.velocity },
      })),
      lastProcessedInput,
      scores: { ...this.scores },
    };
  }

  broadcastSnapshot(): void {
    this.emit(null, {
      type: "snapshot",
      snapshot: this.createSnapshot(),
    });
  }

  private applyAttackIntent(
    player: PlayerState,
    input: PlayerInput,
    previous: PlayerInput,
  ): void {
    if (this.pendingAttackStarts.has(player.id)) {
      beginAttack(player, this.time, PRIMARY_ATTACK_ID);
      this.pendingAttackStarts.delete(player.id);
    }
    if (this.pendingAttackReleases.has(player.id)) {
      finishAttack(player, this.time);
      this.pendingAttackReleases.delete(player.id);
    }
    syncAttackFromInput(player, input, previous, this.time);
  }

  private ensureActiveHitbox(player: PlayerState): void {
    const state = player.attackState;
    if (state.type !== "active") return;
    const exists = this.activeHitboxes.some(
      (hitbox) =>
        hitbox.ownerId === player.id &&
        hitbox.attackId === state.attackId &&
        hitbox.endsAt > this.time,
    );
    if (exists) return;

    const attack = getAttack(state.attackId);
    this.activeHitboxes.push({
      ownerId: player.id,
      attackId: attack.id,
      charge: state.charge,
      endsAt: state.startedAt + attack.activeDuration,
      hitPlayerIds: new Set(),
    });
  }

  private killPlayer(player: PlayerState): void {
    player.lives -= 1;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.attackState = { type: "idle" };
    player.jumpsRemaining = MAX_JUMPS;
    player.health = PLAYER_MAX_HEALTH;

    if (player.lives <= 0) {
      player.position.x = this.map.spawns[player.spawnIndex]?.x ?? 0;
      player.position.y = this.map.blast.bottom + 200;
      return;
    }

    this.respawnPlayer(player);
  }

  private respawnPlayer(player: PlayerState): void {
    const spawn = this.map.spawns[player.spawnIndex] ?? this.map.spawns[0];
    player.position = { x: spawn.x, y: spawn.y };
    player.velocity = { x: 0, y: 0 };
    player.grounded = true;
    player.jumpsRemaining = MAX_JUMPS;
    player.damagePercent = 0;
    player.health = PLAYER_MAX_HEALTH;
    player.attackState = { type: "idle" };
    player.invulnerableUntil = this.time + RESPAWN_INVULN_TIME;
    this.emit(null, {
      type: "player_respawn",
      playerId: player.id,
      position: { ...player.position },
      lives: player.lives,
    });
  }

  private resetPlayersToSpawns(): void {
    for (const player of this.players.values()) {
      const spawn = this.map.spawns[player.spawnIndex] ?? this.map.spawns[0];
      player.position = { x: spawn.x, y: spawn.y };
      player.velocity = { x: 0, y: 0 };
      player.facing = player.spawnIndex === 0 ? 1 : -1;
      player.grounded = true;
      player.jumpsRemaining = MAX_JUMPS;
      player.health = PLAYER_MAX_HEALTH;
      player.damagePercent = 0;
      player.attackState = { type: "idle" };
      player.lives = PLAYER_LIVES;
      player.invulnerableUntil = this.time + 0.4;
    }
  }

  private livingPlayers(): PlayerState[] {
    return [...this.players.values()].filter((player) => player.lives > 0);
  }

  private checkMatchEnd(): void {
    if (this.status !== "playing") return;
    const living = this.livingPlayers();
    if (this.players.size >= 2 && living.length <= 1) {
      this.endMatch(living[0]?.id ?? null);
    }
  }

  private endMatch(winnerId: string | null): void {
    this.status = "ended";
    this.winnerId = winnerId;
    if (winnerId) {
      this.scores[winnerId] = (this.scores[winnerId] ?? 0) + 1;
    }
    this.emit(null, {
      type: "match_ended",
      winnerId,
      scores: { ...this.scores },
    });
  }
}
