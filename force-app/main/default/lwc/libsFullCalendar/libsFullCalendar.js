import { LightningElement } from 'lwc';
import FULL_CALENDAR from '@salesforce/resourceUrl/fullCalendar';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
/**
 * When using this component in an LWR site, please import the below custom implementation of 'loadScript' module
 * instead of the one from 'lightning/platformResourceLoader'
 *
 * import { loadScript } from 'c/resourceLoader';
 *
 * This workaround is implemented to get around a limitation of the Lightning Locker library in LWR sites.
 * Read more about it in the "Lightning Locker Limitations" section of the documentation
 * https://developer.salesforce.com/docs/atlas.en-us.exp_cloud_lwr.meta/exp_cloud_lwr/template_limitations.htm
 */

export default class LibsFullCalendar extends LightningElement {
    isCalInitialized = false;
    error;

    async renderedCallback() {
        if (this.isCalInitialized) {
            return;
        }
        this.isCalInitialized = true;

        try {
            await Promise.all([
                loadScript(this, FULL_CALENDAR + '/main.min.js'),
                loadStyle(this, FULL_CALENDAR + '/main.min.css')
            ]);
            this.initializeCalendar();
        } catch (error) {
            this.error = error;
        }
    }

    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar');
        if (typeof FullCalendar === 'undefined') {
            throw new Error(
                'Could not load FullCalendar. Make sure that Lightning Web Security is enabled for your org. See link below.'
            );
        }
        // eslint-disable-next-line no-undef
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                start: 'title',
                center: '',
                end: 'today prev,next'
            },
            height: 'auto',
            slotMinTime: '08:00:00',
            slotMaxTime: '18:00:00',
            allDaySlot: false,
            weekends: true,
            editable: false,
            eventDisplay: 'block',
            events: [
                {
                    title: 'Team Meeting',
                    start: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T10:00:00',
                    end: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T11:00:00',
                    color: '#3788d8'
                },
                {
                    title: 'Client Call',
                    start: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T14:00:00',
                    end: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T15:00:00',
                    color: '#e74c3c'
                },
                {
                    title: 'Project Review',
                    start: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T16:00:00',
                    end: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T17:00:00',
                    color: '#2ecc71'
                }
            ]
        });
        calendar.render();
    }
}
