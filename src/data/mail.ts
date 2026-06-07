export type Participant = {
  name: string;
  initials: string;
  color: string;
};

export type Message = {
  sender: Participant;
  time: string;
  body: string;
  mine?: boolean;
  attachments?: string[];
};

export type Thread = {
  id: string;
  subject: string;
  preview: string;
  label: string;
  labelColor: string;
  unread: boolean;
  pinned: boolean;
  time: string;
  participants: Participant[];
  messages: Message[];
};

export const currentUser: Participant = {
  name: "Sarah Chen",
  initials: "SC",
  color: "#c8956c"
};

const david: Participant = { name: "David Park", initials: "DP", color: "#c8956c" };
const elena: Participant = { name: "Elena Vasquez", initials: "EV", color: "#6cc88a" };
const james: Participant = { name: "James Liu", initials: "JL", color: "#6ca8c8" };
const rachel: Participant = { name: "Rachel Torres", initials: "RT", color: "#c86c9a" };
const aisha: Participant = { name: "Aisha Patel", initials: "AP", color: "#6cc8c8" };
const daniel: Participant = { name: "Daniel Kim", initials: "DK", color: "#8a6cc8" };

export const threads: Thread[] = [
  {
    id: "t1",
    subject: "Aether Audio Pro Launch — Final Coordination",
    preview: "Team, we are 72 hours out. Need to lock the press kit and embargo list.",
    label: "Priority",
    labelColor: "#c8956c",
    unread: true,
    pinned: true,
    time: "11:45",
    participants: [david, elena, james, currentUser],
    messages: [
      {
        sender: david,
        time: "09:02",
        body: "Team, we are 72 hours out from the Aether Audio Pro launch. I need everyone to lock deliverables by EOD.\n\nPress kit: Elena, visuals finalized?\nEmbargo: Sarah, confirm outlets aligned Thursday 9AM ET.\nSpecs: James, anything changed?"
      },
      {
        sender: elena,
        time: "09:15",
        body: "Press kit visuals finalized.\n\n- High-res renders\n- Lifestyle photography\n- B-roll footage\n- Brand guidelines one-pager",
        attachments: ["Aether_Visuals_v3.zip"]
      },
      {
        sender: currentUser,
        time: "09:23",
        mine: true,
        body: "Confirmed placements:\n\n1. The Verge — feature\n2. Wired — 1200 words\n3. TechCrunch\n4. Engadget\n\nEmbargo Thursday 9AM ET. All NDAs signed."
      },
      {
        sender: james,
        time: "09:41",
        body: "Key change: battery revised to 38 hours from the 36-hour estimate based on final firmware.\n\nOther specs locked: 50mm beryllium drivers, adaptive 6-mic ANC, aptX Lossless, 268g.",
        attachments: ["SpecSheet_Final.pdf"]
      },
      {
        sender: currentUser,
        time: "11:15",
        mine: true,
        body: "Press Kit v4.2 finalized. Updated spec sheet, revised media advisory, new studio-grade hero render, complete asset package.\n\nMoving master copy to Secure Vault."
      },
      {
        sender: david,
        time: "11:45",
        body: "Confirmed. All locked.\n\n12 outlets, NDAs verified. Distribution Wednesday 6PM ET via encrypted channel. We are go for launch."
      }
    ]
  },
  {
    id: "t2",
    subject: "Q2 Media Coverage Report",
    preview: "Attached is the Q2 coverage summary. We hit 340% of target.",
    label: "Client",
    labelColor: "#6cc88a",
    unread: true,
    pinned: false,
    time: "Hier",
    participants: [rachel, currentUser],
    messages: [
      {
        sender: rachel,
        time: "15:20",
        body: "Q2 media coverage summary:\n\n- 47 placements\n- 340% of target\n- 12.8M impressions\n- Tier-1 hit rate: 78%",
        attachments: ["Q2_Report.pdf"]
      },
      {
        sender: currentUser,
        time: "15:45",
        mine: true,
        body: "Incredible numbers. The Bloomberg feature alone is worth the quarter. Client deck by Friday with top 10 placements."
      }
    ]
  },
  {
    id: "t3",
    subject: "Press Inquiry: Bloomberg Tech — AI in PR",
    preview: "I am working on a piece about how PR agencies adopt local AI tools.",
    label: "Priority",
    labelColor: "#c8956c",
    unread: true,
    pinned: false,
    time: "14 Mar",
    participants: [aisha, currentUser],
    messages: [
      {
        sender: aisha,
        time: "16:30",
        body: "Hi Sarah,\n\nI am Aisha Patel at Bloomberg Tech. Working on a feature about PR agencies adopting AI tools, specifically local/private AI vs cloud.\n\nGiven Meridian's privacy-first stance, I would love your perspective. 20-minute call this week?\n\nDeadline: Next Tuesday."
      }
    ]
  },
  {
    id: "t4",
    subject: "Budget Review — Q3 Projection",
    preview: "Q3 projections are ready. Revenue forecast is up 22%.",
    label: "Internal",
    labelColor: "#c8b86c",
    unread: false,
    pinned: false,
    time: "8 Mar",
    participants: [daniel, currentUser],
    messages: [
      {
        sender: daniel,
        time: "17:00",
        body: "Q3 budget ready.\n\nRevenue: $82,000, up 22% QoQ.\nLine items: Aether $18.5K, NovaTech $12K, CES $15K, Offsite $8.5K.\n\nCash flow tight. NovaTech Net 45 creates a gap.",
        attachments: ["Q3_Budget.xlsx"]
      }
    ]
  }
];

export const folders = [
  { id: "inbox", name: "Inbox", icon: "inbox", count: 4, unread: 5 },
  { id: "drafts", name: "Drafts", icon: "file-pen", count: 2, unread: 0 },
  { id: "sent", name: "Sent", icon: "paper-plane", count: 142, unread: 0 },
  { id: "archive", name: "Archive", icon: "box-archive", count: 890, unread: 0 },
  { id: "trash", name: "Trash", icon: "trash-can", count: 7, unread: 0 }
];

export const threadSummary =
  "- Launch locked Thursday 9AM ET, 12 outlets confirmed\n- Battery revised to 38 hours, all materials updated\n- Press kit v4.2 finalized\n- NDAs verified, encrypted distribution Wednesday 6PM";

export const suggestedReply =
  "Hi Aisha,\n\nThank you for reaching out. This is precisely the conversation Meridian was founded to have.\n\nWe run AI capabilities locally rather than relying on cloud APIs. For clients in healthcare, finance, and government, sending email content to a third-party server is not just a privacy risk; it can be a regulatory issue.\n\nI would be happy to walk you through the architecture. Thursday 2PM or Friday 10AM ET both work.\n\nBest,\nSarah";
