public with sharing class AccountCalendarController {
    
    @AuraEnabled(cacheable=true)
    public static List<Calls__c> getCalls(Id accountId) {
        try {
            return [
                SELECT Id, Subject__c, Description__c, Start_Date_Time__c, End_Date_Time__c, 
                       Account__c, Account__r.Name, CreatedBy.Name, CreatedById
                FROM Calls__c 
                WHERE Account__c = :accountId 
                AND CreatedById = :UserInfo.getUserId()
                ORDER BY Start_Date_Time__c ASC
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving calls: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Calls__c createCall(String subject, String description, 
                                   DateTime startDateTime, DateTime endDateTime, 
                                   Id accountId) {
        try {
            Calls__c newCall = new Calls__c(
                Subject__c = subject,
                Description__c = description,
                Start_Date_Time__c = startDateTime,
                End_Date_Time__c = endDateTime,
                Account__c = accountId
            );
            
            insert newCall;
            
            // Return the inserted record with related data
            return [
                SELECT Id, Subject__c, Description__c, Start_Date_Time__c, End_Date_Time__c, 
                       Account__c, Account__r.Name, CreatedBy.Name, CreatedById
                FROM Calls__c 
                WHERE Id = :newCall.Id
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error creating call: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Calls__c updateCall(Id callId, DateTime startDateTime, DateTime endDateTime, 
                                   String subject, String description) {
        try {
            // First verify the user owns this call
            Calls__c existingCall = [
                SELECT Id, CreatedById 
                FROM Calls__c 
                WHERE Id = :callId 
                LIMIT 1
            ];
            
            if (existingCall.CreatedById != UserInfo.getUserId()) {
                throw new AuraHandledException('You can only modify calls you created.');
            }
            
            Calls__c callToUpdate = new Calls__c(
                Id = callId,
                Start_Date_Time__c = startDateTime,
                End_Date_Time__c = endDateTime,
                Subject__c = subject,
                Description__c = description
            );
            
            update callToUpdate;
            
            // Return the updated record with related data
            return [
                SELECT Id, Subject__c, Description__c, Start_Date_Time__c, End_Date_Time__c, 
                       Account__c, Account__r.Name, CreatedBy.Name, CreatedById
                FROM Calls__c 
                WHERE Id = :callId
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error updating call: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void deleteCall(Id callId) {
        try {
            // First verify the user owns this call
            Calls__c callToDelete = [
                SELECT Id, CreatedById 
                FROM Calls__c 
                WHERE Id = :callId 
                LIMIT 1
            ];
            
            if (callToDelete.CreatedById != UserInfo.getUserId()) {
                throw new AuraHandledException('You can only delete calls you created.');
            }
            
            delete callToDelete;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting call: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static Boolean validateCallAccess(Id callId) {
        try {
            Calls__c call = [
                SELECT CreatedById 
                FROM Calls__c 
                WHERE Id = :callId 
                LIMIT 1
            ];
            
            return call.CreatedById == UserInfo.getUserId();
        } catch (Exception e) {
            return false;
        }
    }
}