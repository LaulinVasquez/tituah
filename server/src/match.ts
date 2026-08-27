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
  isProjectileInBlastZone,
  FLIPFLOP_THROW_ID,
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
  syncThrowFromInput,
  triggerRunningFourSlap,
  comboHitTime,
  RUN_SLAP_HIT_COUNT,
  RUN_SLAP_COMBO_CHARGE,
  throwFlipflop,
  startThrowCharge,
  updateThrowCharge,
  cancelThrowCharge,
  getThrowCooldownEndsAt,
  TICK_DT,
  updateAttackState,
  updateProjectiles,
  type HitEvent,
  type MatchSnapshot,
  type MatchStatus,
  type PlayerCount,
  type PlayerInput,
  type PlayerState,
  type Projectile,
  type MatchPlayerResult,
  type ServerMessage,
  type StageMap,
  type AvatarConfiguration,
  emptyAvatar,
} from "@tituah/shared";

export type MatchEmitter = (playerId: string | null, message: ServerMessage) => void;

export interface CombatStats {
  knockouts: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  lastAttackerId: string | null;
}

export type MatchLifecycle = {
  onStart?: (match: Match) => void;
  onEnd?: (match: Match) => void;
};

interface ActiveHitbox {
  ownerId: string;
  attackId: string;
  charge: number;
  endsAt: number;
  hitPlayerIds: Set<string>;
  comboHitIndex?: number;
}

export class Match {
  readonly id: string;
  readonly map: StageMap;
  readonly maxPlayers: PlayerCount;
  readonly players = new Map<string, PlayerState>();
  readonly projectiles: Projectile[] = [];
  readonly scores: Record<string, number> = {};

  status: MatchStatus = "waiting";
  tick = 0;
  time = 0;
  winnerId: string | null = null;
  private countdownSeconds: number | null = null;
  private countdownAccum = 0;

  private readonly inputs = new Map<string, PlayerInput>();
  private readonly previousInputs = new Map<string, PlayerInput>();
  private readonly pendingAttackStarts = new Set<string>();
  private readonly pendingAttackReleases = new Set<string>();
  private readonly pendingThrowStarts = new Set<string>();
  private readonly pendingThrowReleases = new Set<string>();
  private readonly pendingThrows = new Set<string>();
  private readonly pendingRunningFourSlaps = new Set<string>();
  private readonly activeHitboxes: ActiveHitbox[] = [];
  private readonly combat = new Map<string, CombatStats>();
  private readonly readyPlayerIds = new Set<string>();
  private readonly eliminatedAt = new Map<string, number>();
  placements: Record<string, number> = {};
  private rematchOpen = false;
  private readonly emit: MatchEmitter;
  private readonly lifecycle: MatchLifecycle;

  constructor(
    id: string,
    emit: MatchEmitter,
    map: StageMap = DEFAULT_STAGE,
    lifecycle: MatchLifecycle = {},
    maxPlayers: PlayerCount = 2,
  ) {
    this.id = id;
    this.emit = emit;
    this.map = map;
    this.lifecycle = lifecycle;
    this.maxPlayers = maxPlayers;
  }

  get playerCount(): number {
    return this.players.size;
  }

  addPlayer(id: string, name: string, avatar: AvatarConfiguration = emptyAvatar()): PlayerState {
    const used = new Set([...this.players.values()].map((player) => player.spawnIndex));
    let spawnIndex = 0;
    while (used.has(spawnIndex) && spawnIndex < this.maxPlayers) spawnIndex += 1;
    spawnIndex = Math.min(spawnIndex, Math.max(0, this.maxPlayers - 1));
    const spawn = this.map.spawns[spawnIndex] ?? this.map.spawns[0];
    const player: PlayerState = {
      id,
      name,
      position: { x: spawn.x, y: spawn.y },
      velocity: { x: 0, y: 0 },
      facing: spawnIndex % 2 === 0 ? 1 : -1,
      grounded: true,
      jumpsRemaining: MAX_JUMPS,
      health: PLAYER_MAX_HEALTH,
      damagePercent: 0,
      attackState: { type: "idle" },
      throwCooldownEndsAt: 0,
      throwAnimUntil: 0,
      throwChargeStartedAt: 0,
      lives: PLAYER_LIVES,
      lastInputSeq: 0,
      spawnIndex,
      invulnerableUntil: 0,
      avatar: { ...avatar },
    };
    this.players.set(id, player);
    this.scores[id] = 0;
    this.inputs.set(id, emptyInput());
    this.previousInputs.set(id, emptyInput());
    this.combat.set(id, {
      knockouts: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      lastAttackerId: null,
    });
    this.readyPlayerIds.add(id);
    return player;
  }

  get rematch(): boolean {
    return this.rematchOpen;
  }

  readyIds(): string[] {
    return [...this.readyPlayerIds];
  }

  canStart(): boolean {
    if (this.status !== "waiting" || this.players.size < this.maxPlayers) return false;
    for (const id of this.players.keys()) {
      if (!this.readyPlayerIds.has(id)) return false;
    }
    return true;
  }

  markReady(id: string): boolean {
    if (this.status !== "waiting" || !this.players.has(id)) return false;
    this.readyPlayerIds.add(id);
    return true;
  }

  beginRematch(): void {
    this.status = "waiting";
    this.rematchOpen = true;
    this.readyPlayerIds.clear();
    this.projectiles.length = 0;
    this.activeHitboxes.length = 0;
    this.resetPlayersToSpawns();
  }

  resetToMatchmaking(): void {
    if (!this.rematchOpen) return;
    this.rematchOpen = false;
    this.winnerId = null;
    this.placements = {};
    this.readyPlayerIds.clear();
    for (const id of this.players.keys()) {
      this.readyPlayerIds.add(id);
    }
    if (this.status === "countdown") {
      this.cancelCountdown();
    }
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.inputs.delete(id);
    this.previousInputs.delete(id);
    delete this.scores[id];
    this.combat.delete(id);
    this.readyPlayerIds.delete(id);
    if (this.status === "countdown") {
      this.cancelCountdown();
      return;
    }
    if (this.status === "playing") {
      const living = this.livingPlayers();
      if (living.length <= 1) {
        this.endMatch(living[0]?.id ?? null);
      }
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

  throwStart(playerId: string): void {
    this.pendingThrowStarts.add(playerId);
  }

  throwRelease(playerId: string): void {
    this.pendingThrowReleases.add(playerId);
  }

  throw(playerId: string): void {
    this.pendingThrows.add(playerId);
  }

  runningFourSlap(playerId: string): void {
    this.pendingRunningFourSlaps.add(playerId);
  }

  beginCountdown(): void {
    if (this.status !== "waiting" || this.players.size < this.maxPlayers) return;
    this.status = "countdown";
    this.countdownSeconds = 3;
    this.countdownAccum = 0;
    this.resetPlayersToSpawns();
    const snapshot = this.createSnapshot();
    this.emit(null, {
      type: "match_countdown",
      seconds: 3,
      snapshot: cloneSnapshot(snapshot),
    });
  }

  cancelCountdown(): void {
    this.countdownSeconds = null;
    this.countdownAccum = 0;
    if (this.status === "countdown") {
      this.status = "waiting";
    }
  }

  start(): void {
    if (this.status !== "waiting" && this.status !== "countdown") return;
    this.countdownSeconds = null;
    this.countdownAccum = 0;
    this.status = "playing";
    this.rematchOpen = false;
    this.winnerId = null;
    this.tick = 0;
    this.time = 0;
    this.projectiles.length = 0;
    this.activeHitboxes.length = 0;
    this.readyPlayerIds.clear();
    this.eliminatedAt.clear();
    this.placements = {};
    for (const id of this.players.keys()) {
      this.combat.set(id, {
        knockouts: 0,
        deaths: 0,
        damageDealt: 0,
        damageTaken: 0,
        lastAttackerId: null,
      });
    }
    this.resetPlayersToSpawns();
    this.lifecycle.onStart?.(this);
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
    if (this.status === "countdown") {
      this.updateCountdown(dt);
      return;
    }
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
      const autoThrow = updateThrowCharge(player, this.time, this.projectiles);
      if (autoThrow) this.projectiles.push(autoThrow);
      if (player.attackState.type === "active") {
        this.ensureActiveHitbox(player);
      }
      if (player.attackState.type === "combo") {
        this.ensureComboHitboxes(player);
      }
    }

    for (let i = this.activeHitboxes.length - 1; i >= 0; i -= 1) {
      const hitbox = this.activeHitboxes[i];
      const owner = this.players.get(hitbox.ownerId);
      const attacking =
        owner?.attackState.type === "active" || owner?.attackState.type === "combo";
      if (!owner || !attacking || this.time >= hitbox.endsAt) {
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
        this.recordDamage(owner.id, target.id, hit.damage);
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
    const ownersBefore = new Set(
      this.projectiles
        .filter((projectile) => projectile.attackId === FLIPFLOP_THROW_ID)
        .map((projectile) => projectile.ownerId),
    );

    const moved = updateProjectiles(this.projectiles, dt);
    const inBlast = moved.filter((projectile) => isProjectileInBlastZone(projectile, this.map.blast));
    const resolved = resolveProjectileHits(inBlast, [...this.players.values()]);

    const ownersAfter = new Set(
      resolved.remaining
        .filter((projectile) => projectile.attackId === FLIPFLOP_THROW_ID)
        .map((projectile) => projectile.ownerId),
    );

    for (const ownerId of ownersBefore) {
      if (ownersAfter.has(ownerId)) continue;
      const player = this.players.get(ownerId);
      // Early unlock if the item is gone before the timed cooldown ends.
      if (player) player.throwCooldownEndsAt = Math.min(getThrowCooldownEndsAt(player), this.time);
    }

    this.projectiles.length = 0;
    this.projectiles.push(...resolved.remaining);
    for (const hit of resolved.hits) {
      this.recordDamage(hit.attackerId, hit.targetId, hit.damage);
      this.emit(null, { type: "player_hit", ...hit });
    }
  }


  private updateCountdown(dt: number): void {
    if (this.countdownSeconds == null) return;
    this.countdownAccum += dt;
    while (this.countdownAccum >= 1 && this.countdownSeconds != null) {
      this.countdownAccum -= 1;
      this.countdownSeconds -= 1;
      if (this.countdownSeconds <= 0) {
        this.start();
        return;
      }
      this.emit(null, {
        type: "match_countdown",
        seconds: this.countdownSeconds,
        snapshot: cloneSnapshot(this.createSnapshot()),
      });
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
      maxPlayers: this.maxPlayers,
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
    if (input.runningSlap) {
      triggerRunningFourSlap(player, this.time);
    }
    if (this.pendingRunningFourSlaps.has(player.id)) {
      triggerRunningFourSlap(player, this.time);
      this.pendingRunningFourSlaps.delete(player.id);
    }
    if (this.pendingAttackStarts.has(player.id)) {
      beginAttack(player, this.time, PRIMARY_ATTACK_ID);
      this.pendingAttackStarts.delete(player.id);
    }
    if (this.pendingAttackReleases.has(player.id)) {
      finishAttack(player, this.time);
      this.pendingAttackReleases.delete(player.id);
    }
    if (this.pendingThrowStarts.has(player.id)) {
      startThrowCharge(player, this.time, this.projectiles);
      this.pendingThrowStarts.delete(player.id);
    }
    if (this.pendingThrowReleases.has(player.id)) {
      const projectile = throwFlipflop(player, this.time, input.aimAngle, this.projectiles);
      if (projectile) this.projectiles.push(projectile);
      else cancelThrowCharge(player);
      this.pendingThrowReleases.delete(player.id);
    }
    if (this.pendingThrows.has(player.id)) {
      // Legacy instant throw → base power.
      cancelThrowCharge(player);
      const projectile = throwFlipflop(player, this.time, input.aimAngle, this.projectiles, 0);
      if (projectile) this.projectiles.push(projectile);
      this.pendingThrows.delete(player.id);
    }
    syncAttackFromInput(player, input, previous, this.time);
    const thrown = syncThrowFromInput(player, input, previous, this.time, this.projectiles);
    if (thrown) this.projectiles.push(thrown);
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

  private ensureComboHitboxes(player: PlayerState): void {
    const state = player.attackState;
    if (state.type !== "combo") return;

    const attack = getAttack(state.attackId);
    for (let hitIndex = 0; hitIndex < RUN_SLAP_HIT_COUNT; hitIndex += 1) {
      const hitTime = comboHitTime(state.startedAt, hitIndex);
      if (this.time < hitTime) continue;

      const exists = this.activeHitboxes.some(
        (hitbox) =>
          hitbox.ownerId === player.id
          && hitbox.attackId === state.attackId
          && hitbox.comboHitIndex === hitIndex
          && hitbox.endsAt > this.time,
      );
      if (exists) continue;

      this.activeHitboxes.push({
        ownerId: player.id,
        attackId: attack.id,
        charge: RUN_SLAP_COMBO_CHARGE,
        endsAt: hitTime + attack.activeDuration / RUN_SLAP_HIT_COUNT,
        hitPlayerIds: new Set(),
        comboHitIndex: hitIndex,
      });
    }
  }

  combatResults(): Record<string, MatchPlayerResult> {
    const results: Record<string, MatchPlayerResult> = {};
    for (const [playerId, stats] of this.combat) {
      results[playerId] = {
        knockouts: stats.knockouts,
        deaths: stats.deaths,
        damageDealt: stats.damageDealt,
        damageTaken: stats.damageTaken,
      };
    }
    return results;
  }

  private recordDamage(attackerId: string, targetId: string, damage: number): void {
    const attacker = this.combat.get(attackerId);
    const target = this.combat.get(targetId);
    if (attacker) attacker.damageDealt += damage;
    if (target) {
      target.damageTaken += damage;
      target.lastAttackerId = attackerId;
    }
  }

  private killPlayer(player: PlayerState): void {
    const stats = this.combat.get(player.id);
    if (stats) {
      stats.deaths += 1;
      if (stats.lastAttackerId) {
        const attacker = this.combat.get(stats.lastAttackerId);
        if (attacker) attacker.knockouts += 1;
      }
    }
    player.lives -= 1;
    player.velocity.x = 0;
    player.velocity.y = 0;
    player.attackState = { type: "idle" };
    player.throwCooldownEndsAt = 0;
    player.throwAnimUntil = 0;
    player.throwChargeStartedAt = 0;
    player.jumpsRemaining = MAX_JUMPS;
    player.health = PLAYER_MAX_HEALTH;

    if (player.lives <= 0) {
      if (!this.eliminatedAt.has(player.id)) this.eliminatedAt.set(player.id, this.time);
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
    player.throwCooldownEndsAt = 0;
    player.throwAnimUntil = 0;
    player.throwChargeStartedAt = 0;
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
      player.facing = player.spawnIndex % 2 === 0 ? 1 : -1;
      player.grounded = true;
      player.jumpsRemaining = MAX_JUMPS;
      player.health = PLAYER_MAX_HEALTH;
      player.damagePercent = 0;
      player.attackState = { type: "idle" };
      player.throwCooldownEndsAt = 0;
      player.throwAnimUntil = 0;
      player.throwChargeStartedAt = 0;
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
    this.placements = this.computePlacements(winnerId);
    this.emit(null, {
      type: "match_ended",
      winnerId,
      scores: { ...this.scores },
      players: [...this.players.values()].map(clonePlayerState),
      maxPlayers: this.maxPlayers,
      placements: { ...this.placements },
    });
    this.lifecycle.onEnd?.(this);
  }

  private computePlacements(winnerId: string | null): Record<string, number> {
    const ranked = [...this.players.values()].sort((a, b) => {
      const score = (player: PlayerState): number => {
        if (player.id === winnerId) return Number.POSITIVE_INFINITY;
        return this.eliminatedAt.get(player.id) ?? Number.POSITIVE_INFINITY;
      };
      const delta = score(b) - score(a);
      if (delta !== 0) return delta;
      return a.spawnIndex - b.spawnIndex;
    });
    const placements: Record<string, number> = {};
    ranked.forEach((player, index) => {
      placements[player.id] = index + 1;
    });
    return placements;
  }
}
