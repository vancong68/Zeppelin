# Privileged Intents

Zeppelin requires [Privileged Intents](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents) for some of its features.
If your instance of the bot can see more than 10,000 members, you might need to complete Discord's [Privileged Intent Review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review).
Below are some guidelines for answering the questions in the review. Note that these are just a starting point -- you must adjust the answers to match your own setup where appropriate.

## General review questions

- ### "What does your application do?"
  > This is a private instance of Zeppelin, a moderation bot that allows server staff to carry out moderator actions (warn, mute, kick, ban, clean messages, view user information, etc.), keep records of infractions, perform automated actions ("automod", e.g. message filtering), post detailed logs on logging channels, and set up systems such as automatic roles.
  >
  > The bot's source code is available at: https://github.com/ZeppelinBot/Zeppelin
- ### "Do you have a public Privacy Policy telling your users about their data usage?"
  ```
  Yes
  ```
  Official instance's privacy policy for reference: https://zeppelin.gg/privacy-policy
  - #### "Where is your Privacy Policy available?"

    Describe where users can find your bot's privacy policy (e.g. link in bot profile).

  - #### "Please share a link to your Privacy Policy."
    Include a link to your privacy policy here.

## Server Members Intent

- ### "Why do you need the Guild Members intent?"

  > Zeppelin has several features that rely on the Guild Members intent. These include:
  >
  > - Member search based on name, roles, and other details
  > - Member join/leave logs
  > - Automated moderator actions on member join/leave, e.g. raid prevention

- ### "Please provide links to screenshots and/or videos that demonstrate your use case"

  > Please see the following link for screenshots of features reliant on the Guild Members intent.
  >
  > https://github.com/ZeppelinBot/Zeppelin/blob/master/docs/screenshots/GUILD_MEMBERS_INTENT.md

- ### "Are you storing any API Data off-platform (outside of Discord)?"

  ```
  Yes
  ```

  - #### "Are you storing API Data for 30 days or less?"

    ```
    No
    ```

  - #### "How do users contact you to request deletion of their activity data?"

    > Contact details are included as part of the bot's privacy policy.

  - #### "Are you encrypting the data that you store at rest, as is required by our developer policy?"
    **Note:** To comply with [Discord Developer Terms of Service](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service), you must ensure your instance's database is encrypted at rest.

## Message Content Intent

- ### "Can users opt-out of having their message content data tracked?"
  ```
  No
  ```
- ### "Are you storing message content data off-platform (outside of Discord)?"

  ```
  Yes
  ```
  - #### "Are you storing user message content data for 30 days or less?"

    ```
    No
    ```

  - #### "How do users contact you to request deletion of their activity data?"

    > Contact details are included as part of the bot's privacy policy.

  - #### "Are you encrypting the data that you store at rest, as is required by our developer policy?"
    **Note:** To comply with [Discord Developer Terms of Service](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service), you must ensure your instance's database is encrypted at rest.

- ### "Will the message content data be used to train machine learning or AI Models?"

  ```
  No
  ```

- ### "Why do you need the Message Content intent?"

  > Zeppelin has several features that rely on message content. These include:
  >
  > - Advanced auto-moderation tools
  > - Message edit/deletion logs
  > - Starboard

- ### "Please provide links to screenshots and/or videos that demonstrate your use case"
  > Please see the following link for screenshots of features reliant on the Message Content intent.
  >
  > https://github.com/ZeppelinBot/Zeppelin/blob/master/docs/screenshots/MESSAGE_CONTENT_INTENT.md
