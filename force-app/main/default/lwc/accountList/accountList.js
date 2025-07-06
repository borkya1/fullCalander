import { LightningElement, wire } from 'lwc';
import { getListUi } from 'lightning/uiListApi';
import { NavigationMixin } from 'lightning/navigation';
import ACCOUNT_OBJECT from '@salesforce/schema/Account';

export default class AccountList extends NavigationMixin(LightningElement) {
    accounts = [];
    error;
    selectedAccountId;

    @wire(getListUi, {
        objectApiName: ACCOUNT_OBJECT,
        listViewApiName: 'AllAccounts',
        pageSize: 20
    })
    wiredAccounts({ error, data }) {
        if (data) {
            this.accounts = data.records.records.map(record => ({
                Id: record.id,
                Name: record.fields.Name?.value || '',
                BillingStreet: record.fields.BillingStreet?.value || '',
                BillingCity: record.fields.BillingCity?.value || '',
                BillingState: record.fields.BillingState?.value || ''
            }));
            this.error = undefined;
        } else if (error) {
            this.error = error;
            this.accounts = [];
        }
    }

    handleDragStart(event) {
        const accountId = event.target.dataset.accountId;
        this.selectedAccountId = accountId;
        event.dataTransfer.setData('text/plain', accountId);
        event.dataTransfer.effectAllowed = 'move';
        event.target.classList.add('slds-is-dragging');
    }

    handleDragEnd(event) {
        event.target.classList.remove('slds-is-dragging');
    }

    handleAccountNameClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const accountId = event.target.dataset.accountId;
        
        // Navigate to account record page
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: accountId,
                objectApiName: 'Account',
                actionName: 'view'
            }
        });
    }

    handleCardClick(event) {
        const accountId = event.currentTarget.dataset.accountId;
        this.selectedAccountId = accountId;
        
        // Remove selection from other cards
        const cards = this.template.querySelectorAll('.account-card');
        cards.forEach(card => card.classList.remove('selected'));
        
        // Add selection to clicked card
        event.currentTarget.classList.add('selected');
    }

    get hasAccounts() {
        return this.accounts && this.accounts.length > 0;
    }
}