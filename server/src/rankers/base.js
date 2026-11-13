/**
 * @typedef {Object} Candidate
 * @property {Object} driver
 * @property {number} distanceKm
 * @property {number} etaMin
 *
 * @typedef {Object} RankContext
 * @property {Object} ride
 * @property {Candidate[]} candidates
 * @property {Object|null} zone
 * @property {Object} config
 * @property {Date} now
 *
 * @typedef {Object} ScoredDriver
 * @property {Object} driver
 * @property {number} score - Score from 0 to 100
 * @property {number} distanceKm
 * @property {number} etaMin
 * @property {Object} factors
 * @property {string} reason
 */

export class DriverRanker {
  /**
   * Rank eligible candidate drivers best-first.
   * @param {RankContext} _ctx
   * @returns {ScoredDriver[]}
   */
  rank(_ctx) {
    throw new Error('not implemented');
  }
}
