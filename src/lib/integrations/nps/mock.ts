/**
 * Mock NPS sender: logs the survey instead of sending it. The caller
 * still records lane_sync_state, so dedupe behaves exactly as in live mode.
 */
import type { NpsSender, SurveyRequest } from "./index";

export class MockNpsSender implements NpsSender {
  readonly mode = "mock" as const;
  async send(survey: SurveyRequest): Promise<{ ok: boolean; detail: string }> {
    console.info(`[nps:mock] would send ${survey.kind} survey to ${survey.email} (${survey.surveyId})`);
    return { ok: true, detail: "logged" };
  }
}
