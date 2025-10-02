function isSupabaseEnabled() {
  return true;
}

function getUserStore() {
  return require('../database/repositories/usersRepository');
}

function getBotConfigStore() {
  return require('../database/repositories/botConfigsRepository');
}

function getDocumentStore() {
  return require('../database/repositories/documentsRepository');
}

function getTicketStore() {
  return require('../database/repositories/ticketsRepository');
}

function getBattleStore() {
  return require('../database/repositories/battlesRepository');
}

function getPetStore() {
  return require('../database/repositories/petsRepository');
}

function getVerificationSessionStore() {
  return require('../database/repositories/verificationSessionsRepository');
}

function getGuildVerificationConfigStore() {
  return require('../database/repositories/guildVerificationConfigsRepository');
}

module.exports = {
  isSupabaseEnabled,
  getUserStore,
  getBotConfigStore,
  getDocumentStore,
  getTicketStore,
  getBattleStore,
  getPetStore,
  getVerificationSessionStore,
  getGuildVerificationConfigStore,
};
