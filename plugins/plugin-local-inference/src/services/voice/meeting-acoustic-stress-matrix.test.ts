/** Covers the deterministic meeting acoustic stress matrix (#12492). */
import { describe, expect, it } from "vitest";
import {
	buildMeetingAcousticStressMatrix,
	MEETING_STRESS_BACKGROUNDS,
	MEETING_STRESS_NEGATIVE_BEHAVIORS,
	MEETING_STRESS_QUALITIES,
	MEETING_STRESS_ROOMS,
	MEETING_STRESS_SNRS_DB,
	MEETING_STRESS_SPEAKER_COUNTS,
	MEETING_STRESS_SPEECH_STRUCTURES,
} from "./meeting-acoustic-stress-matrix";
import { validateVoiceScenario } from "./voice-scenario";

function covered<T>(values: readonly T[]): Set<T> {
	return new Set(values);
}

describe("buildMeetingAcousticStressMatrix", () => {
	it("covers every required stress axis", () => {
		const matrix = buildMeetingAcousticStressMatrix(42);

		expect(matrix.cases).toHaveLength(
			MEETING_STRESS_SNRS_DB.length * MEETING_STRESS_BACKGROUNDS.length,
		);
		expect(covered(matrix.cases.map((entry) => entry.snrDb))).toEqual(
			covered(MEETING_STRESS_SNRS_DB),
		);
		expect(covered(matrix.cases.map((entry) => entry.background))).toEqual(
			covered(MEETING_STRESS_BACKGROUNDS),
		);
		expect(covered(matrix.cases.map((entry) => entry.room))).toEqual(
			covered(MEETING_STRESS_ROOMS),
		);
		expect(covered(matrix.cases.map((entry) => entry.quality))).toEqual(
			covered(MEETING_STRESS_QUALITIES),
		);
		expect(covered(matrix.cases.map((entry) => entry.speechStructure))).toEqual(
			covered(MEETING_STRESS_SPEECH_STRUCTURES),
		);
		expect(covered(matrix.cases.map((entry) => entry.speakerCount))).toEqual(
			covered(MEETING_STRESS_SPEAKER_COUNTS),
		);
		expect(
			covered(
				matrix.cases
					.map((entry) => entry.expectedBehavior)
					.filter((entry) => entry !== "respond"),
			),
		).toEqual(covered(MEETING_STRESS_NEGATIVE_BEHAVIORS));
	});

	it("emits valid Voice Workbench scenarios", () => {
		const matrix = buildMeetingAcousticStressMatrix(7);

		for (const entry of matrix.cases) {
			const validation = validateVoiceScenario(entry.scenario);
			expect(validation.errors).toEqual([]);
			expect(validation.valid).toBe(true);
			expect(entry.scenario.classes).toEqual(
				expect.arrayContaining([
					"robustness",
					"multi-speaker",
					"overlapping-speech",
				]),
			);
			expect(entry.scenario.participants).toHaveLength(entry.speakerCount);
		}
	});

	it("is deterministic for a seed and changes seeds when requested", () => {
		const first = buildMeetingAcousticStressMatrix(99);
		const second = buildMeetingAcousticStressMatrix(99);
		const third = buildMeetingAcousticStressMatrix(100);

		expect(first.cases.map((entry) => entry.id)).toEqual(
			second.cases.map((entry) => entry.id),
		);
		expect(first.cases.map((entry) => entry.seed)).toEqual(
			second.cases.map((entry) => entry.seed),
		);
		expect(first.cases.map((entry) => entry.seed)).not.toEqual(
			third.cases.map((entry) => entry.seed),
		);
	});

	it("maps quality requirements onto concrete augmentation fields", () => {
		const matrix = buildMeetingAcousticStressMatrix(1);
		const byQuality = new Map(
			matrix.cases.map((entry) => [entry.quality, entry.scenario.environment]),
		);

		expect(byQuality.get("clipping")?.clipThreshold).toBeGreaterThan(0);
		expect(byQuality.get("telephone_bandlimit")?.lowQuality).toBe(true);
		expect(
			byQuality.get("compression_artifacts")?.compressionArtifacts,
		).toBeGreaterThan(0);
		expect(
			byQuality.get("packet_loss_dropouts")?.dropoutProbability,
		).toBeGreaterThan(0);
	});

	it("declares source manifest provenance for every case", () => {
		const matrix = buildMeetingAcousticStressMatrix(5);
		const knownSourceIds = new Set(
			matrix.sourceManifests.map((source) => source.id),
		);

		expect([...knownSourceIds]).toEqual(
			expect.arrayContaining([
				"synthetic_smoke",
				"musan",
				"dns_challenge",
				"whamr",
				"librimix",
			]),
		);
		for (const entry of matrix.cases) {
			expect(entry.sourceManifestIds).toContain("synthetic_smoke");
			expect(
				entry.sourceManifestIds.every((id) => knownSourceIds.has(id)),
			).toBe(true);
		}
	});
});
