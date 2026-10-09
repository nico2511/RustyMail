import { base64ToUtf8String } from "../lib/htmlMessage";
import { state } from "../state";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";

function readMailHtmlRawFromHost(host: HTMLDivElement): string {
  const b64 = host.dataset.emailHtmlB64?.trim();
  if (b64) {
    try {
      return base64ToUtf8String(b64);
    } catch {
      return host.dataset.emailHtml ?? "";
    }
  }
  return host.dataset.emailHtml ?? "";
}

export function buildMailShadowInnerHtml(messageId: string, raw: string, isCleanView = false): string {
  const allowRemoteImages = Boolean(messageId && state.remoteImagesAllowedByMessage[messageId]);
  const { html: sanitized } = sanitizeEmailHtml(raw, {
    allowRemoteImages,
    relocateUnsubscribe: true,
    stripOutlookNoise: isCleanView,
  });
  const blockedRemoteImages =
    !allowRemoteImages && /data-remote-(?:src|background|poster|lowsrc|dynsrc)=/.test(sanitized);
  const remoteImageBanner = blockedRemoteImages
    ? `<div class="remote-images">
        <span>Des images distantes sont bloquées.</span>
        <button type="button" class="mail-load-remote-images">Afficher les images</button>
      </div>`
    : "";
  return `
      <style>
        :host{display:block;box-sizing:border-box;color:var(--text);font-family:var(--font-sans,"IBM Plex Sans","Segoe UI",sans-serif);padding:20px 24px 24px;--rm-hist-indent:14px}
        .mail{padding:0;line-height:1.62;font-size:15px;background:transparent;font-family:var(--font-serif,Literata,Georgia,serif)}
        .mail.mail--clean{font-size:15.5px;line-height:1.68}
        .mail :is(p, ul, ol, blockquote, pre, table){margin:0 0 10px}
        .mail :is(h1,h2,h3){margin:8px 0 10px;font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;font-weight:400;letter-spacing:-0.02em}
        .mail a{color:var(--accent)}
        .remote-images{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 0 12px;padding:10px 14px;box-sizing:border-box;max-width:100%;border:1px solid color-mix(in srgb, var(--dim,#4a5560) 28%, transparent);border-radius:10px;background:color-mix(in srgb, var(--dim,#4a5560) 9%, transparent);color:var(--dim,#4a5560);font-size:12.5px;line-height:1.45;font-weight:500}
        .remote-images span{flex:1 1 10rem;min-width:0;color:inherit}
        .remote-images button{flex:0 0 auto;margin-left:auto;border:1px solid color-mix(in srgb, var(--text,#1a1d22) 22%, transparent);border-radius:999px;background:color-mix(in srgb, var(--text,#1a1d22) 6%, transparent);color:var(--text,#1a1d22);padding:6px 12px;cursor:pointer;font:inherit;font-weight:650}
        .remote-images button:hover{background:color-mix(in srgb, var(--text,#1a1d22) 11%, transparent)}
        .mail a.mail-link-disabled{color:var(--dim,rgba(238,240,238,.56));text-decoration:line-through;cursor:not-allowed}
        .mail a.mail-unsubscribe-link{
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin:12px 0;
          padding:9px 16px;
          border-radius:10px;
          font-weight:650;
          font-size:13px;
          line-height:1.25;
          text-decoration:none !important;
          color:var(--text) !important;
          background:rgba(108,200,138,.16);
          border:1px solid rgba(108,200,138,.42);
          box-shadow:0 1px 0 rgba(0,0,0,.12);
        }
        .mail a.mail-unsubscribe-link:hover{
          background:rgba(108,200,138,.26);
          border-color:rgba(108,200,138,.58);
        }
        .mail .mail-unsubscribe-link--relocated,
        .mail .mail-unsubscribe-section--relocated{display:none !important}
        .mail img{
          box-sizing:border-box;
          max-width:100%;
          height:auto;
          max-height:min(50vh,520px);
          object-fit:contain;
          display:block;
          border-radius:12px;
          border:1px solid rgba(232,228,223,.10);
          cursor:zoom-in
        }
        .mail img:not([width]){
          width:auto;
        }
        .mail img.mail-image-blocked,.mail img.mail-cid-missing{
          min-height:42px;
          padding:10px;
          cursor:default;
          background:rgba(255,255,255,.035);
        }
        .mail img.mail-remote-image-blocked{
          display:none !important;
        }
        .mail img.mail-cid-pending{opacity:.55}
        .mail code{background:rgba(255,255,255,.065);padding:3px 7px;border-radius:6px;font-size:12px}
        .mail article.rm-digest table,.mail article.rm-deblock-digest table,.mail article.rm-amazon-digest table,.mail article.rm-github-digest table{width:100%;border-collapse:collapse;font-size:inherit}
        .mail article.rm-digest th,.mail article.rm-digest td,
        .mail article.rm-deblock-digest th,.mail article.rm-deblock-digest td,
        .mail article.rm-amazon-digest th,.mail article.rm-amazon-digest td,
        .mail article.rm-github-digest th,.mail article.rm-github-digest td{padding:7px 12px 7px 0;vertical-align:top;text-align:left;line-height:1.45}
        .mail article.rm-digest th,.mail article.rm-deblock-digest th,.mail article.rm-amazon-digest tbody th,.mail article.rm-github-digest tbody th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-digest tbody tr:not(:first-child) th,.mail article.rm-digest tbody tr:not(:first-child) td,
        .mail article.rm-deblock-digest tbody tr:not(:first-child) th,.mail article.rm-deblock-digest tbody tr:not(:first-child) td,
        .mail article.rm-amazon-digest tbody tr:not(:first-child) th,.mail article.rm-amazon-digest tbody tr:not(:first-child) td,
        .mail article.rm-github-digest tbody tr:not(:first-child) th,.mail article.rm-github-digest tbody tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.16)}
        .mail article.rm-conversation-report{display:flex;flex-direction:column;gap:14px;margin:0}
        .mail article.rm-conversation-report .rm-conversation-turn{padding:14px 16px;border:1px solid rgba(120,119,117,.14);border-radius:10px;background:transparent}
        .mail article.rm-conversation-report .rm-conversation-turn--cited{position:relative;border-left:3px solid var(--rm-hue,#1d4f8a);background:color-mix(in srgb, var(--text,#16191e) 4%, var(--rm-paper,#fff))}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth-parity="even"]{background:color-mix(in srgb, var(--text,#16191e) 8%, var(--rm-paper,#fff))}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="1"]{--rm-hue:#1d4f8a}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="2"]{--rm-hue:#1b6b45}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="3"]{--rm-hue:#8a4b12}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="4"]{--rm-hue:#7a2f68}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="5"]{--rm-hue:#1a5c72}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-sender-hue="6"]{--rm-hue:#8a3030}
        .mail article.rm-conversation-report .rm-conversation-history{margin-top:0}
        .mail article.rm-conversation-report .rm-conversation-history-tree{display:flex;flex-direction:column;gap:10px;padding:10px 12px 8px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="1"]{margin-left:var(--rm-hist-indent,14px)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="2"]{margin-left:calc(var(--rm-hist-indent,14px) * 2)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="3"]{margin-left:calc(var(--rm-hist-indent,14px) * 3)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="4"],
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth-over="1"]{margin-left:calc(var(--rm-hist-indent,14px) * 4)}
        .mail article.rm-conversation-report .rm-hist-depth-badge{position:absolute;top:8px;right:8px;font-family:var(--font-sans,"IBM Plex Sans",sans-serif);font-size:11px;font-weight:650;line-height:1;padding:3px 6px;border-radius:999px;background:color-mix(in srgb, var(--text,#16191e) 10%, var(--rm-paper,#fff));color:var(--text,#16191e)}
        .mail article.rm-conversation-report .rm-conversation-envelope{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px;font-family:var(--font-sans,"IBM Plex Sans",sans-serif)}
        .mail article.rm-conversation-report .rm-conversation-envelope th,.mail article.rm-conversation-report .rm-conversation-envelope td{padding:4px 12px 4px 0;border:0;vertical-align:top;text-align:left;line-height:1.45;background:transparent}
        .mail article.rm-conversation-report .rm-conversation-envelope th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) th,.mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.12)}
        .mail article.rm-conversation-report .rm-conversation-participants{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mail article.rm-conversation-report .rm-conversation-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;line-height:1.3;background:rgba(173,188,216,.10);color:var(--text);border:1px solid rgba(173,188,216,.18);cursor:default}
        .mail article.rm-conversation-report .rm-conversation-body{margin:0;line-height:1.55}
        .mail article.rm-conversation-report .rm-conversation-body :is(p, div){margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-body br{display:block;content:"";margin-bottom:0.45em}
        .mail table{max-width:100%;border-collapse:collapse}
        .mail table.rm-mail-data{width:100%;font-size:12.5px;margin:8px 0 12px}
        .mail table.rm-mail-data th,.mail table.rm-mail-data td{padding:6px 8px;border:1px solid rgba(120,119,117,.35);vertical-align:top;text-align:left;line-height:1.4}
        .mail table.rm-mail-data th{font-weight:650;background:rgba(255,255,255,.04)}
        .mail blockquote{padding:8px 12px;border-left:3px solid var(--rm-hue,#1d4f8a);background:color-mix(in srgb, var(--text,#16191e) 4%, var(--rm-paper,#fff));border-radius:10px}
        .mail details.rm-mail-folded-quote blockquote{margin-left:var(--rm-hist-indent,14px)}
        .mail details.rm-mail-folded-quote blockquote blockquote{margin-left:var(--rm-hist-indent,14px);background:color-mix(in srgb, var(--text,#16191e) 8%, var(--rm-paper,#fff))}
        .mail details.rm-mail-folded-quote blockquote blockquote blockquote{margin-left:var(--rm-hist-indent,14px);background:color-mix(in srgb, var(--text,#16191e) 4%, var(--rm-paper,#fff))}
        .mail details.rm-mail-folded-quote blockquote blockquote blockquote blockquote{margin-left:var(--rm-hist-indent,14px)}
        .mail details.rm-mail-folded-quote blockquote blockquote blockquote blockquote blockquote{margin-left:0}
        .mail details.rm-mail-folded-quote{margin:1.45rem 0 0}
        .mail details.rm-mail-folded-quote > summary{cursor:pointer;font-family:var(--font-sans,"IBM Plex Sans",sans-serif);font-size:11px;font-weight:600;letter-spacing:.04em;line-height:1.4;color:var(--dim,rgba(238,240,238,.62))}
        .mail details.rm-mail-folded-quote.rm-conversation-history > summary{letter-spacing:.08em;text-transform:uppercase}
        .mail details.rm-mail-folded-quote[open] > summary{margin-bottom:0.7rem}
        .mail details.rm-mail-folded-quote > .rm-mail-quote-body{margin:0;padding:12px 14px 4px;border-radius:12px;border:1px solid rgba(120,119,117,.2);background:rgba(120,119,117,.07);color:var(--text);font-size:inherit;line-height:1.62}
        .mail details.rm-mail-folded-quote > .rm-mail-quote-body :is(p, div, blockquote){margin:0 0 0.7em}
        .mail details.rm-mail-folded-quote > .rm-mail-quote-body .rm-mail-quote-kicker{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12.5px;font-weight:500;line-height:1.4;color:var(--dim,rgba(238,240,238,.72));margin:0 0 2px}
        .mail details.rm-mail-folded-quote > .rm-mail-quote-body .rm-mail-quote-kicker + :not(.rm-mail-quote-kicker){margin-top:0.55em}
        .mail details.rm-mail-folded-quote.rm-conversation-history > .rm-mail-quote-body{padding:0;border:0;background:transparent}
        .mail :is(.gmail_quote, .gmail_quote_container, .x_gmail_quote, [class*="gmail_quote"], blockquote.gmail_quote){display:none !important}
        .mail details.rm-mail-folded-quote :is(.gmail_quote, .gmail_quote_container, .x_gmail_quote, [class*="gmail_quote"], blockquote.gmail_quote){display:block !important}
        .mail .rm-mail-signature{display:none !important}
        .mail :is(.rm-mail-forward-header, .rm-mail-outlook-quote-header){display:none !important}
        .mail.mail--clean :is(#Signature, #x_Signature, #signature, #divRplyFwdMsg, #x_divRplyFwdMsg, [id*="divRplyFwdMsg"]){display:none !important}
        .mail *{max-width:100%}
      </style>
      ${remoteImageBanner}
      <div class="mail${isCleanView ? " mail--clean" : ""}">${sanitized}</div>
    `;
}

export { readMailHtmlRawFromHost };
