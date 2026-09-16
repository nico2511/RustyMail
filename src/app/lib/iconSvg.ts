export function iconSvg(
  name:
    | "trash"
    | "archive"
    | "read"
    | "unread"
    | "reply"
    | "replyAll"
    | "forward"
    | "spark"
    | "download"
    | "open"
    | "close"
    | "move"
    | "attachment"
    | "shield"
    | "mic"
    | "mailViewClean"
    | "mailViewRaw"
    | "thread"
    | "starOutline"
    | "starFilled"
    | "globe"
    | "unsubscribe"
    | "sync"
    | "panel"
    | "tags"
) {
  const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"';
  switch (name) {
    case "trash":
      return `<svg ${common}><path d="M9 3h6m-8 4h10m-9 0 1 15h6l1-15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v7M14 11v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "archive":
      return `<svg ${common}><path d="M4 7h16v14H4V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l1-3h16l1 3H3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 11h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "read":
      return `<svg ${common}><path d="M20 7 9 18l-5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "unread":
      return `<svg ${common}><path d="M4 6h16v12H4V6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7l8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "reply":
      return `<svg ${common}><path d="M10 9V5L3 12l7 7v-4c7 0 10 2 11 6 0-8-3-12-11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "replyAll":
      return `<svg ${common}><path d="M2 10h7M2 13h7M2 16h7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M14 10V6L7 13l7 7v-4c7 0 10 2 11 6 0-8-3-12-11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "forward":
      return `<svg ${common}><path d="M14 9V5l7 7-7 7v-4c-7 0-10 2-11 6 0-8 3-12 11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "spark":
      return `<svg ${common}><path d="M12 2l1.2 4.2L17.5 8l-4.3 1.8L12 14l-1.2-4.2L6.5 8l4.3-1.8L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M19 13l.7 2.4L22 16l-2.3 1-.7 2.5-.7-2.5-2.3-1 2.3-.6L19 13Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "download":
      return `<svg ${common}><path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "open":
      return `<svg ${common}><path d="M14 3h7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 14v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "close":
      return `<svg ${common}><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    case "move":
      return `<svg ${common}><path d="M7 7h10v10H7V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 3h11v11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "attachment":
      return `<svg ${common}><path d="M9 12.5 13.8 7.7a3.1 3.1 0 1 1 4.4 4.4L11 19.3a5.1 5.1 0 1 1-7.2-7.2l7.2-7.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "shield":
      return `<svg ${common}><path d="M12 3 20 6v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9.2 12.3 11 14l3.8-4.2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "mic":
      return `<svg ${common}><path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M8 12v.5a4 4 0 0 0 8 0V12M12 19v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
    case "mailViewClean":
      /* Lecture « mise en page » */
      return `<svg ${common}><path d="M7 8h14M7 13h14M7 18h11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
    case "mailViewRaw":
      /* Source brut (</>) */
      return `<svg ${common}><path d="M9 17 5 12l4-5M15 17l4-5-4-5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/><path d="m13 6.5-2 12" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
    case "thread":
      /* Trois bulles empilées : conversation à plusieurs messages. */
      return `<svg ${common}><path d="M5 6h11a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H10l-4 3v-3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 10h6M9 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case "starOutline":
      return `<svg ${common}><path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9L12 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/></svg>`;
    case "starFilled":
      return `<svg ${common}><path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9L12 3.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    case "globe":
      return `<svg ${common}><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.65" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`;
    case "unsubscribe":
      return `<svg ${common}><path d="M8 8.5h8M8 12h5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M9 16.5h6M12 3v3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="m7.5 6.5 1.2-2.2M16.5 6.5 15.3 4.3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
    case "sync":
      return `<svg ${common}><path d="M20 12a8 8 0 0 1-14.5 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M4 4v5h5M4 12a8 8 0 0 1 14.5-4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M20 20v-5h-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "panel":
      return `<svg ${common}><rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" stroke-width="1.75"/><path d="M11 5v14" stroke="currentColor" stroke-width="1.75"/></svg>`;
    case "tags":
      return `<svg ${common}><path d="M10 3h4l7 7-9 9-7-7 5-5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.35" fill="currentColor"/></svg>`;
  }
}
