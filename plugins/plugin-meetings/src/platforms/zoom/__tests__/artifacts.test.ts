/**
 * Deterministic Zoom artifact import tests. Fixtures are saved response-shaped
 * objects and bot/raw-data events; no live Zoom API or Meeting SDK is used.
 */
import { describe, expect, it } from "vitest";
import {
  buildZoomCanonicalArtifact,
  classifyZoomImportError,
} from "../artifacts.js";

describe("Zoom canonical artifact mapping", () => {
  it("maps cloud transcript and recording files into the canonical meeting schema", () => {
    const artifact = buildZoomCanonicalArtifact({
      meeting: {
        id: "987654321",
        uuid: "zoom-uuid-1",
        topic: "Zoom planning",
        hostId: "host_1",
        hostEmail: "host@example.com",
        timezone: "America/New_York",
        startTime: "2026-07-04T14:00:00.000Z",
        endTime: "2026-07-04T14:30:00.000Z",
      },
      participants: [
        {
          id: "participant-alice",
          zoomParticipantId: "zoom-participant-alice",
          userId: "user-alice",
          displayName: "Alice",
          email: "alice@example.com",
          joinTime: "2026-07-04T14:00:10.000Z",
          leaveTime: "2026-07-04T14:29:00.000Z",
        },
      ],
      recordingFiles: [
        {
          id: "recording-video-1",
          fileType: "MP4",
          fileExtension: "MP4",
          recordingType: "shared_screen_with_speaker_view",
          status: "completed",
          downloadUrl: "https://zoom.us/rec/download/video",
          recordingStart: "2026-07-04T14:00:00.000Z",
          recordingEnd: "2026-07-04T14:30:00.000Z",
        },
        {
          id: "recording-transcript-1",
          fileType: "TRANSCRIPT",
          fileExtension: "VTT",
          recordingType: "audio_transcript",
          status: "completed",
          downloadUrl: "https://zoom.us/rec/download/transcript",
          recordingStart: "2026-07-04T14:01:00.000Z",
          recordingEnd: "2026-07-04T14:29:00.000Z",
        },
      ],
      transcriptEntries: [
        {
          id: "caption-1",
          sourceFileId: "recording-transcript-1",
          speakerId: "zoom-participant-alice",
          diarizedSpeakerId: "speaker-0",
          speakerName: "Alice",
          text: "Alice will send the Zoom notes.",
          startTime: "2026-07-04T14:02:00.000Z",
          endTime: "2026-07-04T14:02:04.000Z",
          languageCode: "en-US",
        },
      ],
      generatedNotes: [
        {
          kind: "action_item",
          text: "Alice will send the Zoom notes.",
          assignee: "Alice",
          priority: "medium",
        },
      ],
      qualityMetrics: {
        participantMappingAccuracy: 1,
        cloudTranscriptWer: 0.04,
        cloudTranscriptCer: 0.01,
      },
    });

    expect(artifact.schemaVersion).toBe("elizaos.meeting_artifact.v1");
    expect(artifact.source).toBe("zoom");
    expect(artifact.meeting.durationMinutes).toBe(30);
    expect(artifact.streams.map((stream) => stream.kind)).toEqual(
      expect.arrayContaining(["zoom_cloud_transcript", "zoom_cloud_recording"]),
    );
    expect(artifact.participants).toEqual([
      expect.objectContaining({
        id: "participant-alice",
        zoomParticipantId: "zoom-participant-alice",
        zoomUserId: "user-alice",
      }),
    ]);
    expect(artifact.transcriptSpans).toEqual([
      expect.objectContaining({
        participantId: "participant-alice",
        diarizedSpeakerId: "speaker-0",
        speakerLabel: "Alice",
        source: "zoom_cloud_transcript",
        text: "Alice will send the Zoom notes.",
        provenance: expect.objectContaining({
          zoomSpeakerId: "zoom-participant-alice",
          diarizedSpeakerId: "speaker-0",
          sourceFileId: "recording-transcript-1",
        }),
      }),
    ]);
    expect(artifact.generatedNotes).toEqual([
      expect.objectContaining({
        kind: "action_item",
        sourceSpanIds: ["caption-1"],
      }),
    ]);
    expect(artifact.metrics.participantMappingAccuracy).toBe(1);
    expect(artifact.metrics.cloudTranscriptWer).toBe(0.04);
    expect(artifact.metrics.transcriptWordCount).toBe(6);
    expect(artifact.missingArtifacts).toEqual([]);
  });

  it("records mixed-audio source loss when per-participant Zoom capture is unavailable", () => {
    const artifact = buildZoomCanonicalArtifact({
      meeting: {
        id: "987654321",
        startTime: "2026-07-04T14:00:00.000Z",
        endTime: "2026-07-04T14:05:00.000Z",
      },
      participants: [
        {
          id: "participant-bob",
          displayName: "Bob",
          muted: true,
        },
      ],
      recordingFiles: [],
      transcriptEntries: [],
      recordingDisabled: true,
      liveCapture: {
        id: "zoom-bot-capture-1",
        capturePath: "bot_web_client",
        outcome: "captured",
        startedAt: "2026-07-04T14:00:00.000Z",
        endedAt: "2026-07-04T14:05:00.000Z",
        streams: [
          {
            id: "mixed-audio",
            kind: "mixed_audio",
            uri: "file:///captures/zoom-mixed.wav",
            sampleRateHz: 16000,
            channels: 1,
          },
          {
            id: "screen",
            kind: "screen_video",
            uri: "file:///captures/zoom-screen.webm",
          },
        ],
        transcriptSpans: [
          {
            id: "bot-span-1",
            speakerName: "Bob",
            diarizedSpeakerId: "speaker-1",
            text: "Bob was audible only on the mixed stream.",
            startOffsetMs: 1200,
            endOffsetMs: 4200,
          },
        ],
      },
    });

    expect(artifact.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "zoom_bot_mixed_audio",
          sourceLoss: expect.arrayContaining([
            "mixed_audio_only",
            "per_participant_audio_unavailable",
          ]),
        }),
        expect.objectContaining({ kind: "zoom_bot_screen_video" }),
      ]),
    );
    expect(artifact.transcriptSpans).toEqual([
      expect.objectContaining({
        source: "zoom_live_capture",
        participantId: "participant-bob",
        diarizedSpeakerId: "speaker-1",
      }),
    ]);
    expect(artifact.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "participant_id_missing",
        "muted_participant",
        "mixed_audio_source_loss",
      ]),
    );
    expect(artifact.missingArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactType: "recording",
          reason: "recording_disabled",
        }),
        expect.objectContaining({
          artifactType: "participant_audio",
          reason: "per_participant_audio_unavailable",
        }),
      ]),
    );
    expect(artifact.metrics.sourceLossCount).toBe(2);
  });

  it("preserves Meeting SDK raw-data per-participant streams when available", () => {
    const artifact = buildZoomCanonicalArtifact({
      meeting: {
        id: "987654321",
        durationMinutes: 10,
      },
      participants: [
        {
          id: "participant-carol",
          zoomParticipantId: "zoom-participant-carol",
          displayName: "Carol",
        },
      ],
      recordingFiles: [
        {
          id: "recording-audio-1",
          fileType: "M4A",
          fileExtension: "M4A",
          downloadUrl: "https://zoom.us/rec/download/audio",
        },
      ],
      transcriptFiles: [
        {
          id: "transcript-1",
          fileType: "TRANSCRIPT",
          fileExtension: "VTT",
          downloadUrl: "https://zoom.us/rec/download/transcript",
        },
      ],
      transcriptEntries: [],
      liveCapture: {
        id: "zoom-raw-data-1",
        capturePath: "meeting_sdk_raw_data",
        outcome: "captured",
        streams: [
          {
            id: "participant-carol-audio",
            kind: "participant_audio",
            participantId: "participant-carol",
            uri: "file:///captures/carol.wav",
            sampleRateHz: 16000,
            channels: 1,
          },
          {
            id: "raw-data",
            kind: "raw_data",
            uri: "file:///captures/raw-data.jsonl",
          },
        ],
      },
      qualityMetrics: {
        perParticipantDer: 0.02,
        cpWer: 0.05,
      },
    });

    expect(artifact.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "zoom_bot_participant_audio",
          participantId: "participant-carol",
          sourceLoss: [],
        }),
        expect.objectContaining({ kind: "zoom_bot_raw_data" }),
      ]),
    );
    expect(artifact.missingArtifacts).toEqual([]);
    expect(artifact.metrics.perParticipantDer).toBe(0.02);
    expect(artifact.metrics.cpWer).toBe(0.05);
  });

  it("classifies Zoom import and capture failures into missing artifacts", () => {
    expect(
      classifyZoomImportError({ code: 403, message: "Permission denied" }),
    ).toEqual(expect.objectContaining({ reason: "permission_denied" }));
    expect(
      classifyZoomImportError({
        response: { status: 404 },
        message: "Not found",
      }),
    ).toEqual(expect.objectContaining({ reason: "meeting_not_found" }));
    expect(
      classifyZoomImportError({ code: 401, message: "invalid_grant revoked" }),
    ).toEqual(expect.objectContaining({ reason: "revoked_access" }));
    expect(
      classifyZoomImportError({ code: 410, message: "download URL expired" }),
    ).toEqual(expect.objectContaining({ reason: "expired_media_url" }));
    expect(
      classifyZoomImportError(new Error("waiting room admission timed out")),
    ).toEqual(expect.objectContaining({ reason: "waiting_room_timeout" }));
    expect(classifyZoomImportError(new Error("host removed bot"))).toEqual(
      expect.objectContaining({ reason: "host_removed_bot" }),
    );
    expect(classifyZoomImportError(new Error("network loss"))).toEqual(
      expect.objectContaining({ reason: "network_loss" }),
    );
    expect(classifyZoomImportError(new Error("host ended meeting"))).toEqual(
      expect.objectContaining({ reason: "host_ended_meeting" }),
    );
  });
});
