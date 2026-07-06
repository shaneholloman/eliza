/**
 * Discord DM widget delivery must preserve the same neutral interaction blocks
 * used by guild messages. The test covers the renderer-to-send-options seam so
 * components-only replies still carry concrete discord.js action rows.
 */
import type { Content } from "@elizaos/core";
import {
	ActionRowBuilder,
	type MessageActionRowComponentBuilder,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { renderDiscordInteractions } from "../interactions";
import { buildDmSendOptions } from "../messages";
import { buildDiscordComponents } from "../utils";

function choiceOnlyContent(): Content {
	return {
		text: [
			"[CHOICE:confirm]",
			"yes=Yes, do it",
			"no=No, cancel",
			"[/CHOICE]",
		].join("\n"),
	} as Content;
}

describe("#14527 Discord keeps widget components on DM messages", () => {
	it("a components-only reply yields DM send options carrying the action row + buttons", () => {
		const rendered = renderDiscordInteractions(choiceOnlyContent());

		expect(rendered.components.length).toBeGreaterThan(0);

		const built = buildDiscordComponents(rendered.components);
		expect(built).toBeDefined();
		expect(built?.length).toBeGreaterThan(0);
		expect(built?.[0]).toBeInstanceOf(ActionRowBuilder);

		const textContent =
			rendered.text.trim().length > 0 ? rendered.text : "Choose an option:";

		const options = buildDmSendOptions(textContent, [], built);

		expect(options.components).toBeDefined();
		expect(options.components?.length).toBe(built?.length);
		expect(options.components?.[0]).toBeInstanceOf(ActionRowBuilder);

		const row = options
			.components?.[0] as ActionRowBuilder<MessageActionRowComponentBuilder>;
		const json = row.toJSON();
		const labels = json.components.map((c) => (c as { label?: string }).label);
		expect(labels).toEqual(["Yes, do it", "No, cancel"]);
	});

	it("omits the components key entirely for a plain-text reply (no empty array)", () => {
		const rendered = renderDiscordInteractions({
			text: "just a normal reply, no widgets",
		} as Content);
		expect(rendered.components.length).toBe(0);

		const built = buildDiscordComponents(rendered.components);
		expect(built).toBeUndefined();

		const options = buildDmSendOptions(
			"just a normal reply, no widgets",
			[],
			built,
		);
		expect("components" in options).toBe(false);
		expect(options.content).toBe("just a normal reply, no widgets");
	});
});
