<!-- Draft — needs legal review -->
<!-- Owner note: draft written by the copywriter, not a lawyer. Have it reviewed before publishing. Placeholders "[TBD]" must be filled by the owner. -->

# privacy — Privacy policy

<!-- page: privacy | slug: /privacy | lang: en | dir: ltr -->

- page.title: Privacy policy | Darjina
- page.meta_description: How Darjina handles shop, staff and customer data in the app and on the website: storage, separation between shops, no selling, and deletion requests.
<!-- ≤155 chars -->

---

## section#intro

- intro.title: Privacy policy
- intro.updated: Last updated: 19 November 2026
- intro.text: This policy explains how we collect, use and protect data in the Darjina app and on the darjina.com website. We've written it in plain language; if you have a question, email us at info@darjina.com.

---

## section#who-we-are

- who.title: Who we are
- who.text: Darjina is an app for abaya tailor shops, based in the Kingdom of Bahrain. The entity responsible for the service is Darjina (دارجينا). Contact: info@darjina.com or +973 3404 7233.

---

## section#roles

- roles.title: Who owns customer data?
- roles.text: The shop enters its customers' data in the app and decides what to record. We provide the tool and store the data on the shop's behalf, and we don't use it for any purpose of our own. If you are a customer of a shop that uses Darjina, please contact the shop first about your data; you can also email us and we'll pass your request on to the shop.

---

## section#data-we-collect

- collect.title: The data we handle
- collect.groups:
  - collect.shop.title: Shop data
    collect.shop.items:
      - Shop name, phone, commercial registration (CR) and logo.
      - Branches: name, phone, location and photo.
      - Shop settings: currency, country code, completion time, language and time zone.
  - collect.staff.title: Shop owner and staff data
    collect.staff.items:
      - Shop owner: name, phone, email, ID number, gender and date of birth.
      - Staff: name, phone, email, ID number and gender.
      - Sign-in details: email and password (the password is stored encrypted by the authentication service, and we cannot see it).
      - Activity log inside the app: who recorded a payment, who changed a status or price, and when.
  - collect.customer.title: Customer data (entered by the shop)
    collect.customer.items:
      - Name and mobile number, plus anything the shop chooses to add: ID number, date of birth, notes.
      - Measurements in centimetres and their history.
      - Receipts, payments and the history of each order.
  - collect.website.title: The darjina.com website
    collect.website.items:
      - The website has no input forms. When you tap the WhatsApp or email button, you move to that app and your message is subject to its policy.
      - The website uses no analytics tools and no cookies. It only remembers your language choice in your own browser, and loads its fonts from Google Fonts.

---

## section#how-we-use

- use.title: How we use data
- use.items:
  - To run the app: recording orders, measurements and payments and showing them to the shop's team.
  - To sign users in and protect accounts, and to send password recovery codes by email.
  - To produce PDF receipts, the dashboard and reports within the shop itself.
  - To reply to your messages and support requests.
- use.never_title: What we don't do
- use.never_items:
  - We don't sell, rent or share any data for advertising purposes.
  - We don't use a shop's customer data to contact those customers or to market to them.
  - We don't combine one shop's data into reports seen by another shop.

---

## section#storage-security

- storage.title: Where data is stored and how we protect it
- storage.items:
  - App data is stored on Supabase servers (a Postgres database, plus authentication and storage services).
  - Every shop is isolated from the others: the isolation rules are enforced in the database itself, so no user can see another shop's data.
  - Within a shop, permissions depend on the role: the shop owner has wider permissions than staff (such as changing prices, refunds and the full dashboard).
  - The connection between the app and the servers is encrypted.
  - The shop logo is kept in private storage, readable only by the shop's team and uploaded by the shop owner.
  - The PDF receipt is created on the phone itself and never prints the customer's ID number or date of birth. When it's shared on WhatsApp or elsewhere, it's subject to that app's policy.
  - No protection method is 100% complete, but we follow recognised practices and review them continually.

---

## section#accounts

- accounts.title: Accounts
- accounts.text: A shop owner can create an account for the shop in the app; the shop starts working once we have reviewed and approved the request. Staff accounts are created by the shop owner, who sets their passwords and can deactivate any of them. Everyone can change their own password in the app. A staff member's personal statistics show an anonymous comparison with colleagues, and only appear when the shop has at least three active colleagues.

---

## section#retention

- retention.title: Retention and deletion
- retention.items:
  - Inside the app, records are never permanently deleted during normal use; "deactivating" hides a record from new selections and keeps the full history of orders and payments.
  - To delete an account in the app, or to ask for the deletion by email, see the {link} page.
    <!-- privacy.delete_link_sentence; {link} = privacy.delete_link_text “Delete your account” → /en/delete-account/ (TICKET-064, docs/design/copy-account-deletion-page.md) -->
  - We respond to deletion requests as soon as we can, and we may need to verify the identity of the person making the request, or refer back to the shop concerned.
  - Each shop's data is kept for as long as the shop uses the app, and after it is closed it stays deactivated and seen by nobody. <!-- OQ-162 -->
  - A shop's data is never shared with any other entity.

---

## section#rights

- rights.title: Your rights
- rights.text: You can ask for a copy of your data, or for it to be corrected, by emailing us at info@darjina.com. An account can be deleted in the app, or you can ask for the deletion as explained on the {link} page. When an account is deleted, its holder's personal details and sign-in are deleted, and the shop's business records (receipts, payments, customers and their measurements) stay. If the shop is closed with the deletion, its records are kept deactivated and seen by nobody. We do not erase a shop's records on request. <!-- OQ-162 --> A customer's data can also be corrected directly by the shop that recorded it.
  <!-- {link} = privacy.delete_link_text “Delete your account” → /en/delete-account/; the address is a mailto: link (TICKET-064, docs/design/copy-account-deletion-page.md "Privacy page replacements") -->

---

## section#children

- children.title: Children
- children.text: The app is intended for shop owners and their staff, not for children.

---

## section#changes

- changes.title: Changes to this policy
- changes.text: We may update this policy when we add new features (such as the order page or payment links when they launch). We'll publish the new version here with the date it was updated, and notify shop owners of important changes.

---

## section#contact

- contact.title: Contact us
- contact.items:
  - Email: info@darjina.com
  - Phone and WhatsApp: +973 3404 7233
  - Kingdom of Bahrain
