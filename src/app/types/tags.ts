export type Tag = {
  family: "Source" | "Kind" | "Entity" | "State";
  value: string;
};

export type Entity = {
  kind: "Date" | "Person" | "Email" | "Link" | "Identifier" | "ActionItem";
  value: string;
  sourceMessageId?: string | null;
};
