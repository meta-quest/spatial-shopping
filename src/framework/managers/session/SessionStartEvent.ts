/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/** Event emitted when an XR session starts. */
export class SessionStartEvent {
  constructor(
    public sessionId: string,
    public sessionEndTimestamp: number,
  ) {}

  /** Returns a string representation of the session start event. */
  toString(): string {
    const ts = new Date(this.sessionEndTimestamp).toISOString();
    return `SessionStartEvent { sessionId: ${this.sessionId}, sessionEndTimestamp: ${ts} }`;
  }
}
