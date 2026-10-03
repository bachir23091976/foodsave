const {test}=require('node:test'),assert=require('node:assert/strict');
const {reservationPhase,canValidatePickup}=require('./reservation-lifecycle-fixture.cjs');
const {localeTools}=require('./i18n-fixture.cjs');
const order={status:'CONFIRMED',noShowEligibleAt:'2030-10-02T18:15Z',offer:{pickupStart:'2030-10-02T17:00Z',pickupEnd:'2030-10-02T18:00Z'}};
for(const [time,phase,pickup] of [['16:59','active',false],['17:00','active',true],['18:00','active',true],['18:15','grace',true],['18:16','review',false]])test(time+' reservation phase',()=>{
  const now=Date.parse('2030-10-02T'+time+'Z');assert.equal(reservationPhase(order,now),phase);assert.equal(canValidatePickup(order,now),pickup);
});
test('historical expiry is review, never derived NO_SHOW',()=>{const legacy={...order,noShowEligibleAt:null};assert.equal(reservationPhase(legacy,Date.parse('2030-10-02T18:01Z')),'review');assert.equal(legacy.status,'CONFIRMED');});
for(const status of ['COMPLETED','CANCELLED','NO_SHOW'])test(status+' is history without pickup',()=>{assert.equal(reservationPhase({...order,status}),'history');assert.equal(canValidatePickup({...order,status}),false);});
test('FR/EN no-show labels',()=>{assert.equal(localeTools('fr').t('reservation.noShow'),'Non récupéré');assert.equal(localeTools('en').t('reservation.noShow'),'Not collected');});
