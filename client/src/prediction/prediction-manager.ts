import {
  applyMovement,
  clonePlayerState,
  emptyInput,
  INPUT_HISTORY_LIMIT,
  syncAttackFromInput,
  TICK_DT,
  type MatchSnapshot,
  type PlayerInput,
  type PlayerState,
  type StageMap,
} from "@tituah/shared";

interface PendingInput {
  input: PlayerInput;
  previous: PlayerInput;
}

export class PredictionManager {
  private pending: PendingInput[] = [];
  private previousInput = emptyInput();
  private player: PlayerState | null = null;
  private localId: string | null = null;

  constructor(private readonly map: StageMap) {}

  reset(snapshot: MatchSnapshot, localId: string): void {
    this.localId = localId;
    this.pending = [];
    this.previousInput = emptyInput();
    const local = snapshot.players.find((player) => player.id === localId);
    this.player = local ? clonePlayerState(local) : null;
  }

  apply(player: PlayerState, input: PlayerInput, time: number): PlayerState {
    const previous = this.previousInput;
    applyMovement(player, input, previous, this.map.platforms, TICK_DT);
    syncAttackFromInput(player, input, previous, time);
    this.pending.push({ input, previous });
    if (this.pending.length > INPUT_HISTORY_LIMIT) {
      this.pending.shift();
    }
    this.previousInput = input;
    this.player = player;
    this.localId = player.id;
    return player;
  }

  reconcile(snapshot: MatchSnapshot): PlayerState | null {
    const localId = this.localId;
    if (!localId) return this.player;

    const serverPlayer = snapshot.players.find((player) => player.id === localId);
    if (!serverPlayer) return this.player;

    const lastAck = snapshot.lastProcessedInput[localId] ?? 0;
    this.pending = this.pending.filter((entry) => entry.input.sequence > lastAck);

    const localAttack = this.player?.attackState;
    const reconciled = clonePlayerState(serverPlayer);
    let previous = this.pending[0]?.previous ?? this.previousInput;
    for (const entry of this.pending) {
      applyMovement(reconciled, entry.input, previous, this.map.platforms, TICK_DT);
      previous = entry.input;
    }
    if (localAttack) {
      reconciled.attackState = localAttack;
    }

    this.player = reconciled;
    return reconciled;
  }

  current(): PlayerState | null {
    return this.player;
  }
}
