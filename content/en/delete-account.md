<!-- Source: docs/design/copy-account-deletion-page.md of the main repository (ux-designer, 2026-11-18; ADR-0040 sections 1, 5 and 6; US-AUTH-017; TICKET-064). Texts used verbatim. -->
<!-- The app labels in quotes are the exact en strings of the app copy deck (accountDeleteEntry, settingsTitle, settingsSectionAccount, authChangePasswordTitle, signupReviewTitle, signupRefusedTitle, accountDeleteConfirmCheck): keep them in step if the deck changes. -->

# delete-account — Delete your account

<!-- page: delete-account | slug: /en/delete-account/ | lang: en | dir: ltr | indexed, in sitemap.xml -->

- page.title: Delete your account | Darjina
- page.meta_description: How to delete a Darjina account in the app or by email, and what is deleted and what stays of the shop's data.
<!-- ~115 chars -->

---

## section#intro

- intro.title: Delete your account
- intro.updated: Last updated: 18 November 2026
- intro.text: Everyone who uses the Darjina app can delete their own account inside the app, or ask for the deletion by email if the app is not available. This page explains both ways, and what is deleted and what stays.

---

## section#in-app

- inapp.title: Delete in the app
- inapp.items:
  - inapp.owner.title: Shop owner
    inapp.owner.text: Go to “Settings” → “My account” → “Delete my account”.
  - inapp.worker.title: Staff member
    inapp.worker.text: Open the app menu → “Delete my account”, below “Change password”.
  - inapp.applicant.title: New shop owner, not yet approved
    inapp.applicant.text: On the “Your account is being reviewed” or “Your account request was not accepted” screen: the “Delete my account” button.
- inapp.steps: The app first shows exactly what will be deleted. Then it asks you to tick “I understand this cannot be undone.” and to enter the account's password, and to confirm once more. After the deletion the app returns to the sign-in screen and the account can no longer be used to sign in.
- inapp.no_button: If the email was confirmed but the shop details were not sent yet, the app shows no delete button; ask for the deletion by email as explained below. The same applies to an account that was deactivated and can no longer sign in.

---

## section#what-happens

- effects.title: A shop owner's account or a staff account
- effects.intro: The app works out what the deletion does from the account's situation at that moment, and shows it before you confirm.
- effects.shop.title: If the account is the shop's last active owner
- effects.shop.items:
  - The shop and all its branches are closed.
  - Every staff sign-in of the shop is deleted and the staff lose access at once.
  - The online order page stops, the shop's Instagram handle becomes free for others, and the shop's notifications stop.
  - This also applies to a new shop that was not approved yet or was refused.
- effects.account.title: If the account is a staff member's, or an owner's while another active owner exists
- effects.account.items:
  - Only this account is deleted; the shop goes on working with the rest of its team.
  - The shop's records show “Deleted account” instead of the account holder's name.
  - Receipts and payments recorded with this account stay in the shop's records.
- effects.final: Deletion is final: it cannot be undone and the account or the shop cannot be restored. The same email address can be used for a new account afterwards.

---

## section#deleted

- deleted.title: What is deleted
- deleted.items:
  - Sign-ins (email and password), so they can no longer be used.
  - The details of the deleted account holders in the shop: name, phone number, email, ID number, birthday and gender; “Deleted account” takes the place of the name.
  - The phones' registrations for notifications.
  - When the shop is closed: the shop's phone number and its Instagram handle for the order page.

---

## section#kept

- kept.title: What stays
- kept.text: The shop's business records are kept: receipts, payments and their history, customers and their measurements, models and their photos, online requests, and the shop's name, commercial registration, logo and branches. They are kept deactivated and seen by nobody, neither in the app nor on the website, with no fixed end date.
- kept.no_erasure: We do not erase these records on request. <!-- OQ-162 -->
<!-- OQ-162 (open for the PO, default used): if the PO decides otherwise, only kept.no_erasure and the last clause of kept.text change. -->
- kept.customers: Customers have no Darjina accounts. For a question about a customer's data, contact the shop that recorded it, or write to us and we pass the request on.

---

## section#by-email

- email.title: Ask for the deletion without the app
- email.text: You can ask for your account to be deleted by writing to info@darjina.com:
- email.items:
  - from the account's own email address;
  - or, if that is not possible, with the shop's name and phone number so we can check the request.
- email.after: We check that the request comes from the account holder, then delete the account the same way the app does and answer your email within 30 days.
- email.subject: Darjina account deletion request
- email.cta: Email us
- email.cta_href: mailto:info@darjina.com?subject=Darjina%20account%20deletion%20request

---

## section#more

- more.privacy_link: Back to the privacy policy
<!-- → /en/privacy/ -->
