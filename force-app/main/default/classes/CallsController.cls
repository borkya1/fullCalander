public with sharing class CallsController {
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCalls(String recordId) {
        System.debug('⚡ recordId = ' + recordId);
    
        List<Calls__c> calls;
        if (String.isNotBlank(recordId)) {
            calls = [SELECT Id, Subject__c, Start_Time__c, End_Time__c 
                     FROM Calls__c 
                     WHERE Account__c = :recordId];
        } else {
            calls = [SELECT Id, Subject__c, Start_Time__c, End_Time__c 
                     FROM Calls__c 
                     WHERE OwnerId = :UserInfo.getUserId()];
        }
    
        List<Map<String, String>> results = new List<Map<String, String>>();
        for (Calls__c c : calls) {
            Map<String, String> evt = new Map<String, String>();
            evt.put('id', c.Id);
            evt.put('title', c.Subject__c);
            evt.put('start', c.Start_Time__c != null ? c.Start_Time__c.format() : null);
            evt.put('endTime', c.End_Time__c != null ? c.End_Time__c.format() : null);
            results.add(evt);
        }
    
        System.debug('⚡ Returning events: ' + results);
        return results;
    }
    
    public class CallWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String start;
        @AuraEnabled public String endTime;

        public CallWrapper(String id, String title, String start, String endTime) {
            this.id = id;
            this.title = title;
            this.start = start;
            this.endTime = endTime;
        }
    }
}