import Decimal from 'decimal.js';

// Configure decimal.js for high precision
Decimal.config({
  precision: 50,
  rounding: Decimal.ROUND_DOWN,
});

/**
 * Represents the current state of a Uniswap V3 pool slot0
 */
export interface Slot0 {
  /** Current sqrt price as Q64.96 */
  sqrtPriceX96: string;
  /** Current tick */
  tick: number;
  /** Most recent observation index */
  observationIndex: number;
  /** Current observation cardinality */
  observationCardinality: number;
  /** Current maximum observation cardinality */
  observationCardinalityNext: number;
  /** Current protocol fee */
  feeProtocol: number;
  /** Whether the pool is unlocked */
  unlocked: boolean;
}

/**
 * Represents liquidity tracking for a specific tick
 */
export interface TickInfo {
  /** Amount of net liquidity added when tick is crossed from left to right */
  liquidityNet: string;
  /** Total amount of liquidity that uses the pool either as tick lower or tick upper */
  liquidityGross: string;
  /** Fee growth on the other side of this tick (relative to the current tick) */
  feeGrowthOutside0X128: string;
  feeGrowthOutside1X128: string;
  /** Seconds spent on the other side of this tick (relative to the current tick) */
  secondsOutside: number;
  /** Whether the tick is initialized */
  initialized: boolean;
}

/**
 * Pool configuration
 */
export interface PoolConfig {
  /** Pool address */
  address: string;
  /** Token0 address */
  token0: string;
  /** Token1 address */
  token1: string;
  /** Fee tier (e.g., 3000 for 0.3%) */
  fee: number;
  /** Tick spacing */
  tickSpacing: number;
  /** Token0 decimals */
  decimals0: number;
  /** Token1 decimals */
  decimals1: number;
}

/**
 * Represents the complete state of a Uniswap V3 pool for simulation
 */
export interface PoolState {
  /** Pool configuration */
  config: PoolConfig;
  /** Current slot0 state */
  slot0: Slot0;
  /** Current global liquidity */
  liquidity: string;
  /** Global fee growth for token0 */
  feeGrowthGlobal0X128: string;
  /** Global fee growth for token1 */
  feeGrowthGlobal1X128: string;
  /** Protocol fees owed in token0 */
  protocolFees0: string;
  /** Protocol fees owed in token1 */
  protocolFees1: string;
  /** Tick data - sparse mapping of tick -> TickInfo */
  ticks: Map<number, TickInfo>;
  /** Block timestamp of last update */
  blockTimestamp: number;
}

/**
 * Position information for tracking
 */
export interface Position {
  /** Position ID (computed from owner, tickLower, tickUpper) */
  id: string;
  /** Owner address */
  owner: string;
  /** Lower tick of the position */
  tickLower: number;
  /** Upper tick of the position */
  tickUpper: number;
  /** Amount of liquidity */
  liquidity: string;
  /** Fee growth inside when position was last updated */
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  /** Fees owed to the position */
  tokensOwed0: string;
  tokensOwed1: string;
}

/**
 * Creates a default tick info
 */
export function createDefaultTickInfo(): TickInfo {
  return {
    liquidityNet: '0',
    liquidityGross: '0',
    feeGrowthOutside0X128: '0',
    feeGrowthOutside1X128: '0',
    secondsOutside: 0,
    initialized: false,
  };
}

/**
 * Creates a new pool state from configuration and initial parameters
 */
export function createPoolState(
  config: PoolConfig,
  initialSqrtPriceX96: string,
  initialTick: number,
  initialLiquidity: string = '0'
): PoolState {
  return {
    config,
    slot0: {
      sqrtPriceX96: initialSqrtPriceX96,
      tick: initialTick,
      observationIndex: 0,
      observationCardinality: 1,
      observationCardinalityNext: 1,
      feeProtocol: 0,
      unlocked: true,
    },
    liquidity: initialLiquidity,
    feeGrowthGlobal0X128: '0',
    feeGrowthGlobal1X128: '0',
    protocolFees0: '0',
    protocolFees1: '0',
    ticks: new Map(),
    blockTimestamp: Math.floor(Date.now() / 1000),
  };
}

/**
 * Deep clones a pool state for simulation purposes
 */
export function clonePoolState(state: PoolState): PoolState {
  return {
    config: { ...state.config },
    slot0: { ...state.slot0 },
    liquidity: state.liquidity,
    feeGrowthGlobal0X128: state.feeGrowthGlobal0X128,
    feeGrowthGlobal1X128: state.feeGrowthGlobal1X128,
    protocolFees0: state.protocolFees0,
    protocolFees1: state.protocolFees1,
    ticks: new Map(
      Array.from(state.ticks.entries()).map(([tick, info]) => [
        tick,
        { ...info },
      ])
    ),
    blockTimestamp: state.blockTimestamp,
  };
}

/**
 * Gets tick info, returning default if not initialized
 */
export function getTickInfo(state: PoolState, tick: number): TickInfo {
  return state.ticks.get(tick) || createDefaultTickInfo();
}

/**
 * Sets tick info in the pool state
 */
export function setTickInfo(
  state: PoolState,
  tick: number,
  info: TickInfo
): void {
  state.ticks.set(tick, info);
}

/**
 * Updates the block timestamp
 */
export function updateTimestamp(state: PoolState): void {
  state.blockTimestamp = Math.floor(Date.now() / 1000);
}

/**
 * Serializes pool state to JSON for fixture storage
 */
export function toFixture(state: PoolState): Record<string, unknown> {
  return {
    config: state.config,
    slot0: state.slot0,
    liquidity: state.liquidity,
    feeGrowthGlobal0X128: state.feeGrowthGlobal0X128,
    feeGrowthGlobal1X128: state.feeGrowthGlobal1X128,
    protocolFees0: state.protocolFees0,
    protocolFees1: state.protocolFees1,
    ticks: Array.from(state.ticks.entries()).map(([tick, info]) => ({
      tick,
      ...info,
    })),
    blockTimestamp: state.blockTimestamp,
  };
}

/**
 * Deserializes pool state from JSON fixture
 */
export function fromFixture(fixture: Record<string, unknown>): PoolState {
  const ticksArray = (fixture.ticks as Array<{
    tick: number;
    liquidityNet: string;
    liquidityGross: string;
    feeGrowthOutside0X128: string;
    feeGrowthOutside1X128: string;
    secondsOutside: number;
    initialized: boolean;
  }>) || [];

  const ticks = new Map<number, TickInfo>();
  for (const tickData of ticksArray) {
    ticks.set(tickData.tick, {
      liquidityNet: tickData.liquidityNet,
      liquidityGross: tickData.liquidityGross,
      feeGrowthOutside0X128: tickData.feeGrowthOutside0X128,
      feeGrowthOutside1X128: tickData.feeGrowthOutside1X128,
      secondsOutside: tickData.secondsOutside,
      initialized: tickData.initialized,
    });
  }

  return {
    config: fixture.config as PoolConfig,
    slot0: fixture.slot0 as Slot0,
    liquidity: fixture.liquidity as string,
    feeGrowthGlobal0X128: fixture.feeGrowthGlobal0X128 as string,
    feeGrowthGlobal1X128: fixture.feeGrowthGlobal1X128 as string,
    protocolFees0: fixture.protocolFees0 as string,
    protocolFees1: fixture.protocolFees1 as string,
    ticks,
    blockTimestamp: fixture.blockTimestamp as number,
  };
}

/**
 * Validates pool state for consistency
 */
export function validatePoolState(state: PoolState): boolean {
  try {
    // Check that sqrt price is positive
    const sqrtPrice = new Decimal(state.slot0.sqrtPriceX96);
    if (sqrtPrice.lte(0)) return false;

    // Check that liquidity is non-negative
    const liquidity = new Decimal(state.liquidity);
    if (liquidity.lt(0)) return false;

    // Check tick spacing alignment
    if (state.slot0.tick % state.config.tickSpacing !== 0) {
      // Allow small deviation for current tick (it doesn't need to be aligned)
      // but the deviation should be less than tickSpacing
      const deviation = Math.abs(state.slot0.tick % state.config.tickSpacing);
      if (deviation >= state.config.tickSpacing) return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}