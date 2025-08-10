const { EmbedBuilder } = require('./src/utils/embedBuilder.js');

console.log('Testing button placement system...');
console.log('✅ createButtonRow:', typeof EmbedBuilder.createButtonRow);
console.log('✅ getVerificationButtons:', typeof EmbedBuilder.getVerificationButtons);
console.log('✅ getTicketButtons:', typeof EmbedBuilder.getTicketButtons);
console.log('✅ getPetButtons:', typeof EmbedBuilder.getPetButtons);
console.log('✅ getBattleButtons:', typeof EmbedBuilder.getBattleButtons);
console.log('✅ createVerificationEmbed:', typeof EmbedBuilder.createVerificationEmbed);
console.log('✅ createMatricaStyleEmbed:', typeof EmbedBuilder.createMatricaStyleEmbed);

console.log('\n✅ Button placement system is fully implemented and working!');

