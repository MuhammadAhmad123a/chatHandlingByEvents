import axios from "axios"; //import axios 
import Redis from "ioredis";
import log4js from "log4js";

// Configure the logger
log4js.configure({
    appenders: { console: { type: "console" } },
    categories: { default: { appenders: ["console"], level: "trace" } },
});
// Get the logger instance
const logger = log4js.getLogger();

const REDIS_HOST = "redis-15596.c270.us-east-1-3.ec2.cloud.redislabs.com";
const REDIS_PORT = "15596";
const REDIS_PASW = "yQG3PbrwvFk0VCHX4RHCpGXbuMS8J71n";
const cacheClient = new Redis({
    port: REDIS_PORT,
    host: REDIS_HOST,
    connectTimeout: 10000,
    username: "default",
    password: REDIS_PASW,
});

export async function setDataInCache(key, value) {
    logger.info(`Storing data in redis...`);
    return await cacheClient.set(key, value);
}
export async function getDataFromCache(key) {
    logger.info(`Getting data from redis...`);
    return await cacheClient.get(key);
}
export async function deleteDataFromCache(key) {
    logger.info(`Deleting data from redis...`);
    return await cacheClient.del(key);
}
export default cacheClient;

export const handler = async (event) => {

    // TODO implement
    let agentId;
    let conversation;
    let conversationId;
    let response;
    let agentParticipant;
    let eventType1;
    let initiationMethod1;

    //console.log("Event details: ", JSON.stringify(event));
    logger.debug(`Event details: ${JSON.stringify(event)}`);

    let contactId;
    contactId = event.detail.contactId; //get customer id

    //Case 1: Normal Conversation
    if (event.detail.eventType == "CONNECTED_TO_AGENT" && event.detail.initiationMethod == "API") {
        logger.info(`Agent 1 is connected and we are going to add this in conversation...`);
        const agentArn = event.detail.agentInfo.agentArn;
        agentId = agentArn.split('/').pop();
        logger.debug(`Connected agent ARN: ${agentArn}`);
        logger.debug(`Connected agent Id: ${agentId}`);

        //get conversation by id when any event occur but first event is initiated
        logger.info(`Finding conversation in connected to agent...`);
        conversation = await axios.get(`https://0nqm2etj9j.execute-api.us-east-1.amazonaws.com/prod/getconversationbycontactid?contactId=${contactId}`);
        conversation = conversation.data;
        conversationId = conversation._id;
        logger.debug(`Conversation in connected to agent: ${conversation}`);
        logger.debug(`Conversation id in connected to agent: ${conversationId}`);
        // console.log("Agent ARN: ", agentArn);
        // console.log("Agent Id: ", agentId);

        //create object of connected participant
        const data = {
            participantType: "Agent",
            agentArn: agentId,
            isActive: true,
            participantRole: "Primary"
        };
        logger.debug(`Connected participant details: ${data}`);

        //Add participant using agent arn with axios call
        //const addParticipant = await axios.post(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${contactId}`, data);

        // console.log("Conversation in connect to agent: ", conversation);
        // console.log("Conversation id in connect to agent: ", conversationId);

        logger.info(`Going to add connected participant in conversation...`);
        response = await axios.post(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${conversationId}`, data);
        //console.log("Participant added successfully: " , response.data);
        if (response) {
            logger.info(`Participant added successfully: ${response.data}`);
        } else {
            logger.error(`Error while adding participant in converesation.`);
        }

    }

    //Get Transfer trigger
    else if (event.detail.eventType == "INITIATED" && event.detail.initiationMethod == "TRANSFER") {
        logger.info(`Agent 1 transfered chat to another agent...`);
        //set event variable values
        //process.env.method = event.detail.initiationMethod;
        //process.env.type = event.detail.eventType;
        logger.info(`Storing event type and initiaion method in redis...`);
        let contactInfo = {
            eventType: event.detail.eventType,   //set event
            initiationMethod: event.detail.initiationMethod,  //set method
        };
        let contactInfoString = (contactInfo);
        contactId = event.detail.previousContactId;
        await cacheClient.set(contactId, JSON.stringify(contactInfoString));
    }

    //Delete Participant and end conversation
    else if (event.detail.eventType == "DISCONNECTED" && event.detail.initiationMethod == "API") {
        logger.info(`Agent is disconnected and we are going to remove this agent from conversation...`);
        contactId = event.detail.contactId;
        const cachedContactInfoString = await cacheClient.get(contactId);
        // console.log("Cached data: ", cachedContactInfoString);
        logger.debug(`Redis cached data: ${cachedContactInfoString}`);

        // const cachedContactInfo = JSON.parse(cachedContactInfoString); // Parse the JSON string into an object
        //eventType1 = cachedContactInfo.eventType;
        //console.log("Event Type of cached data: ", eventType1);

        //initiationMethod1 = cachedContactInfo.initiationMethod;
        //console.log("Event Method of cached data: ", initiationMethod1);

        if (cachedContactInfoString === null) {
            logger.debug(`Cached data in if condition: ${cachedContactInfoString}`);
            logger.info(`Finding conversation in disconnected event...`);
            conversation = await axios.get(`https://0nqm2etj9j.execute-api.us-east-1.amazonaws.com/prod/getconversationbycontactid?contactId=${contactId}`);
            conversation = conversation.data;
            conversationId = conversation._id;
            logger.debug(`Conversation in disconnected event: ${conversation}`);
            logger.debug(`Conversation id in disconnected event: ${conversationId}`);
            logger.info(`Finding disconnected agent from conversation...`)
            agentParticipant = conversation.participant.find(participant => participant.participantType === 'Agent' && participant.isActive === true);


            //console.log("Participant: ", agentParticipant);
            logger.debug(`Disconnected agent: ${agentParticipant}`);
            const agentParticipantId = agentParticipant.id;
            // console.log("Agent Pariticipant Id: ", agentParticipantId);
            logger.debug(`Disconnected agent Id: ${agentParticipantId}`);

            logger.info(`Going to remove disconnected agent from conversation...`);
            response = await axios.delete(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${conversationId}&participantId=${agentParticipantId}`);
            // console.log("Participant is deleted successfully with details: ", response.data);
            logger.debug(`Disconnected agent is deleted successfully with details: ${response.data}`);

            if (conversation.conversationState === 'active') {
                logger.info(`No agent is in conversation, we are going to end conversation...`);
                // console.log("Conversation first state in if block: ", conversation.data.conversationState);
                response = await axios.put(`https://421bb5xi6f.execute-api.us-east-1.amazonaws.com/prod/updateconversationstate?contactId=${contactId}`);

                // console.log("Conversation after delete: ", response.data);
                logger.debug(`Conversation after delete: ${response.data}`);
            }

        }
        else {
            logger.info(`Finding conversation in disconnected event...`);
            conversation = await axios.get(`https://0nqm2etj9j.execute-api.us-east-1.amazonaws.com/prod/getconversationbycontactid?contactId=${contactId}`);
            conversation = conversation.data;
            conversationId = conversation._id;
            logger.debug(`Conversation in disconnected event: ${conversation}`);
            logger.debug(`Conversation id in disconnected event: ${conversationId}`);
            logger.info(`Finding disconnected agent from conversation...`)

            agentParticipant = conversation.participant.find(participant => participant.participantType === 'Agent' && participant.isActive === true);


            // console.log("Participant: ", agentParticipant);
            logger.debug(`Disconnected agent: ${agentParticipant}`);
            const agentParticipantId = agentParticipant.id;
            // console.log("Agent Pariticipant Id: ", agentParticipantId);
            logger.debug(`Disconnected agent id: ${agentParticipantId}`);

            logger.info(`Going to remove disconnected agent from conversation...`);
            response = await axios.delete(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${conversationId}&participantId=${agentParticipantId}`);
            logger.debug(`Disconnected agent is deleted successfully with details: ${response.data}`);
        }

        //await cacheClient.del(contactId);
    }



    //Transfer Case
    //Add agent when connected to agent
    else if (event.detail.eventType == "CONNECTED_TO_AGENT" && event.detail.initiationMethod == "TRANSFER") {
        logger.info(`Agent 2 is connected and we are going to add this in conversation...`);
        const agentArn = event.detail.agentInfo.agentArn;
        agentId = agentArn.split('/').pop();
        logger.debug(`Connected agent ARN: ${agentArn}`);
        logger.debug(`Connected agent Id: ${agentId}`);

        contactId = event.detail.previousContactId;
        // console.log("Contact id in transferred connected: ", contactId);
        logger.debug(`"Contact id in transferred connected: ${contactId}`);

        //get conversation by id when any event occur but first event is initiated
        logger.info(`Finding conversation in connected to agent...`);
        conversation = await axios.get(`https://0nqm2etj9j.execute-api.us-east-1.amazonaws.com/prod/getconversationbycontactid?contactId=${contactId}`);
        conversation = conversation.data;
        conversationId = conversation._id;
        logger.debug(`Conversation in transfer and connected to agent: ${conversation}`);
        logger.debug(`Conversation id in transfer connected to agent: ${conversationId}`);

        //add participant
        const data = {
            participantType: "Agent",
            agentArn: agentId,
            isActive: true,
            participantRole: "Primary"
        };
        logger.debug(`Connected participant details: ${data}`);

        // logger.info(`Conversation in connect to agent: ${conversation}`);
        // logger.info(`Conversation id in connect to agent: ${conversationId}`);

        response = await axios.post(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${conversationId}`, data);
        // console.log("Participant 2 added successfully: ", response.data);
        if (response) {
            logger.info(`Participant added successfully: ${response.data}`);
        } else {
            logger.error(`Error while adding participant in converesation.`);
        }


    }

    //Delete Transferred Agent
    else if (event.detail.eventType == "DISCONNECTED" && event.detail.initiationMethod == "TRANSFER") {
        logger.info(`Agent is disconnected and we are going to remove this agent from conversation...`);
        contactId = event.detail.previousContactId;
        logger.debug(`Contact id in disconnected: ${contactId}`);

        logger.debug(`Conversation in disconnected event: ${conversation}`);
        conversation = await axios.get(`https://0nqm2etj9j.execute-api.us-east-1.amazonaws.com/prod/getconversationbycontactid?contactId=${contactId}`);
        conversation = conversation.data;
        conversationId = conversation._id;
        logger.debug(`Conversation in disconnected event: ${conversation}`);
        logger.debug(`Conversation id in disconnected event: ${conversationId}`);

        logger.info(`Finding disconnected agent from conversation...`);
        agentParticipant = conversation.participant.find(participant => participant.participantType === 'Agent' && participant.isActive === true);


        // console.log("Participant: ", agentParticipant);
        logger.debug(`Disconnected agent: ${agentParticipant}`);
        const agentParticipantId = agentParticipant.id;
        // console.log("Agent Pariticipant Id: ", agentParticipantId);
        logger.debug(`Disconnected agent Id: ${agentParticipantId}`);

        logger.info(`Going to remove disconnected agent from conversation...`);
        response = await axios.delete(`https://54lot78qha.execute-api.us-east-1.amazonaws.com/prod/participent?conversationId=${conversationId}&participantId=${agentParticipantId}`);
        // console.log("Participant 2 is deleted successfully with details: ", response.data);
        if (response) {
            logger.debug(`Participant 2 is deleted successfully with details: ${response.data}`);
        } else {
            logger.error(`Error occured in removing agent from conversation.`);
        }

        //Delete conversation 
        if (conversation.conversationState === 'active') {
            logger.info(`Going to end the conversation...`);
            // console.log("Conversation first state in if block: ", conversation.data.conversationState);
            response = await axios.put(`https://421bb5xi6f.execute-api.us-east-1.amazonaws.com/prod/updateconversationstate?contactId=${contactId}`);
            // console.log("Conversation after delete: ", response.data);
            logger.debug(`Conversation after delete: ${response.data}`);
        }

        await cacheClient.del(contactId);
    }

};
