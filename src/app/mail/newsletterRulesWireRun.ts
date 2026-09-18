import {
  addNewsletterDomainRuleFromInput,
  removeNewsletterDomainRuleFromElement,
} from "./newsletterRulesDomainWireRun";
import {
  addNewsletterRuleFromMessageElement,
  removeNewsletterRuleFromMessageElement,
} from "./newsletterRulesMessageWireRun";

export {
  addNewsletterDomainRuleFromInput,
  removeNewsletterDomainRuleFromElement,
} from "./newsletterRulesDomainWireRun";
export {
  addNewsletterRuleFromMessageElement,
  removeNewsletterRuleFromMessageElement,
} from "./newsletterRulesMessageWireRun";

export async function tryHandleNewsletterRulesWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "newsletter-domain-add":
      void addNewsletterDomainRuleFromInput();
      return true;
    case "newsletter-domain-remove":
      void removeNewsletterDomainRuleFromElement(element);
      return true;
    case "newsletter-msg-add-rule":
      void addNewsletterRuleFromMessageElement(element);
      return true;
    case "newsletter-msg-remove-rule":
      void removeNewsletterRuleFromMessageElement(element);
      return true;
    default:
      return false;
  }
}
