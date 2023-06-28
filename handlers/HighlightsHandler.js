require('dotenv').config();
const Alexa = require('ask-sdk-core');
const axios = require('axios');

const { HIGHLIGHTS_API_URL, SKILL_NAME, AUTH_TOKEN } = process.env;

const getFeedItem = async ({ handlerInput, index }) => {
  try {
    const appId = handlerInput?.requestEnvelope?.session?.application?.applicationId;
    const { data: feedItem } = await axios.get(`${HIGHLIGHTS_API_URL}/${appId}?page=${index}&auth_token=${AUTH_TOKEN}`);
    if (!feedItem.length) return null;
    return feedItem[0];
  } catch (error) {
    return null;
  }
};

const getProfileEmail = async (handlerInput) => {
  try {
    const { serviceClientFactory } = handlerInput;
    const upsServiceClient = serviceClientFactory.getUpsServiceClient();
    const profileEmail = await upsServiceClient.getProfileEmail();
    return profileEmail;
  } catch (error) {
    return null;
  }
};

const sendHighlightEmail = async ({ emailTo, subject, text }) => {
  try {
    await axios.post(`${HIGHLIGHTS_API_URL}/send-email?auth_token=${AUTH_TOKEN}`, {
      emailTo, subject, text,
    });
    return true;
  } catch (error) {
    return null;
  }
};

module.exports = {
  canHandle(handlerInput) {
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const { attributesManager } = handlerInput;
    const { context } = attributesManager.getSessionAttributes();

    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && (intentName === 'HighlightsIntent'
        || context === 'highlights' && intentName === 'YesIntent'
        || context === 'highlights' && intentName === 'NextIntent'
        || context === 'highlights' && intentName === 'NoIntent'
      );
  },
  async handle(handlerInput) {

    const { attributesManager, responseBuilder } = handlerInput;
    const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
    const sessionAttributes = attributesManager.getSessionAttributes();
    sessionAttributes.context = 'highlights';
    attributesManager.setSessionAttributes(sessionAttributes);

    const { highlightIndex = 0 } = sessionAttributes;
    if (intentName === 'HighlightsIntent' || intentName === 'NextIntent') {
      sessionAttributes.highlightIndex = highlightIndex + 1;
      attributesManager.setSessionAttributes(sessionAttributes);

      const feedItem = await getFeedItem({ handlerInput, index: highlightIndex + 1 });

      if (!feedItem) {
        return responseBuilder
          .speak('No momento, não temos destaques')
          .withShouldEndSession(true)
          .getResponse();
      }

      return responseBuilder
        .speak(`${feedItem.text}. Deseja receber detalhes por email?`)
        .reprompt(`${feedItem.text}. Deseja receber detalhes por email?`)
        .withShouldEndSession(false)
        .getResponse();
    }

    if (intentName === 'NoIntent') {
      return responseBuilder
        .speak('Está bem.')
        .withShouldEndSession(true)
        .getResponse();
    }

    if (intentName === 'YesIntent') {
      const profileEmail = await getProfileEmail(handlerInput);
      if (!profileEmail) {
        return responseBuilder
          .speak('Você não concedeu permissão para e-mail, para que você possa fazer isso te enviei um card para a tela inicial do seu app Alexa para que eu possa te enviar destaques.')
          .withShouldEndSession(true)
          .withAskForPermissionsConsentCard(['alexa::profile:email:read'])
          .getResponse();
      }
      const feedItem = await getFeedItem({ handlerInput, index: highlightIndex });
      sendHighlightEmail({
        emailTo: profileEmail,
        subject: `Destaque de ${SKILL_NAME}`,
        text: `A ${SKILL_NAME} tem um destaque para você. ${feedItem.emailText || feedItem.text}`,
      });

      return responseBuilder
        .speak('Te enviei um e-mail sobre o destaque.')
        .withShouldEndSession(true)
        .getResponse();
    }
  },
};