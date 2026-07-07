/**
 * Settings config surface authored with the spatial vocabulary. The shipped
 * settings route is GUI-only today, while this presentational component keeps a
 * small snapshot contract for future modality adapters.
 *
 * Purely presentational: a snapshot of already-exposed settings in, primitives
 * out, with no fetch, React state, or shell-host import. With no host data it
 * shows labelled rows with em-dash placeholders, so the panel is always
 * meaningful.
 */

import {
	Card,
	Divider,
	HStack,
	List,
	type SpatialTone,
	Text,
} from "@elizaos/ui/spatial";

/** One displayed setting: a label and its current value. */
export interface SettingsRow {
	label: string;
	value: string;
	/** Tone for the value (e.g. "success" for an enabled feature). */
	tone?: SpatialTone;
}

export interface SettingsSnapshot {
	rows: SettingsRow[];
	loading?: boolean;
	error?: string | null;
}

/** Labelled rows with placeholders, so the panel renders before a host pushes. */
export const EMPTY_SETTINGS_SNAPSHOT: SettingsSnapshot = {
	rows: [
		{ label: "Theme", value: "—" },
		{ label: "Background", value: "—" },
		{ label: "Voice", value: "—" },
		{ label: "Model", value: "—" },
	],
};

export interface SettingsSpatialViewProps {
	snapshot: SettingsSnapshot;
}

export function SettingsSpatialView({ snapshot }: SettingsSpatialViewProps) {
	const rows = snapshot.rows;
	return (
		<Card gap={1} padding={1}>
			<HStack gap={1} align="center">
				<Text style="caption" tone="success" grow={1}>
					{snapshot.loading ? "loading" : "settings"}
				</Text>
				<Text style="caption" tone="muted">
					config
				</Text>
			</HStack>

			{snapshot.error ? (
				<Text tone="danger" style="caption">
					{snapshot.error}
				</Text>
			) : null}

			<Divider label="settings" />
			{rows.length === 0 ? (
				<Text tone="muted" align="center" style="caption">
					No settings loaded
				</Text>
			) : (
				<List gap={0}>
					{rows.map((row) => (
						<HStack key={row.label} gap={1} align="center">
							<Text grow={1} wrap={false}>
								{row.label}
							</Text>
							<Text tone={row.tone ?? "muted"} wrap={false}>
								{row.value}
							</Text>
						</HStack>
					))}
				</List>
			)}
		</Card>
	);
}

export default SettingsSpatialView;
