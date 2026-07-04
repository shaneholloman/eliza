/**
 * Storybook states for the Chat Typing Indicator chat composite used by shared
 * conversation and composer surfaces.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { TurnStatus, TypingIndicator } from "./chat-typing-indicator";

const meta = {
  title: "Composites/Chat/ChatTypingIndicator",
  component: TypingIndicator,
  tags: ["autodocs"],
  argTypes: {
    agentName: { control: "text" },
    variant: { control: "select", options: ["default", "game-modal"] },
    className: { control: "text" },
  },
  args: {
    agentName: "Eliza",
    variant: "default",
  },
} satisfies Meta<typeof TypingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LongAgentName: Story = {
  args: {
    agentName: "Eliza the Helpful Assistant",
  },
};

export const GameModal: Story = {
  args: {
    variant: "game-modal",
    agentName: "Eliza",
  },
};

/** The overlay's phase-aware variant (dots + debounced label) on a dark glass
 * substrate, as it renders in the continuous-chat overlay. */
export const TurnStatusWorking: Story = {
  render: () => (
    <div className="rounded-2xl bg-black/70 p-4">
      <TurnStatus
        status={{ kind: "running_action", actionName: "SEND_MESSAGE" }}
      />
    </div>
  ),
};

export const TurnStatusSpeaking: Story = {
  render: () => (
    <div className="rounded-2xl bg-black/70 p-4">
      <TurnStatus status={{ kind: "speaking" }} />
    </div>
  ),
};
