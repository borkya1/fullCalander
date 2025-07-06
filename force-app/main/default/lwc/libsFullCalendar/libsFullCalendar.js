import { LightningElement, track } from 'lwc';
import FULL_CALENDAR from '@salesforce/resourceUrl/fullCalendar';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import createCall from '@salesforce/apex/CallsController.createCall';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
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
    calendar;
    @track events = [];
    draggedAccount = null;

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
        this.calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                start: 'title',
                center: '',
                end: 'today prev,next'
            },
            height: 'auto',
            slotMinTime: '08:00:00',
            slotMaxTime: '18:00:00',
            slotDuration: '00:30:00',
            allDaySlot: false,
            weekends: true,
            editable: false,
            eventDisplay: 'block',
            events: this.events,
            droppable: true,
            drop: this.handleDrop.bind(this),
            eventReceive: this.handleEventReceive.bind(this),
            dayHeaderDidMount: this.setupDropZones.bind(this)
        });
        this.calendar.render();
        
        // Set up custom drop zones for calendar slots
        this.setupCalendarDropZones();
    }

    setupCalendarDropZones() {
        // Add event listeners for drag and drop on the calendar container
        const calendarEl = this.template.querySelector('.calendar');
        if (calendarEl) {
            calendarEl.addEventListener('dragover', this.handleDragOver.bind(this));
            calendarEl.addEventListener('drop', this.handleCalendarDrop.bind(this));
            calendarEl.addEventListener('dragenter', this.handleDragEnter.bind(this));
            calendarEl.addEventListener('dragleave', this.handleDragLeave.bind(this));
        }
    }

    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        
        // Find the time slot being hovered over
        const timeSlot = this.findTimeSlotFromEvent(event);
        if (timeSlot) {
            this.highlightTimeSlot(timeSlot);
        }
    }

    handleDragEnter(event) {
        event.preventDefault();
        const calendarEl = this.template.querySelector('.calendar');
        if (calendarEl) {
            calendarEl.classList.add('drag-over');
        }
    }

    handleDragLeave(event) {
        // Only remove highlight if we're leaving the calendar entirely
        if (!event.currentTarget.contains(event.relatedTarget)) {
            const calendarEl = this.template.querySelector('.calendar');
            if (calendarEl) {
                calendarEl.classList.remove('drag-over');
            }
            this.clearTimeSlotHighlight();
        }
    }

    handleCalendarDrop(event) {
        event.preventDefault();
        
        // Get the dragged account data
        const accountData = event.dataTransfer.getData('text/plain');
        if (!accountData) return;
        
        let accountInfo;
        try {
            accountInfo = JSON.parse(accountData);
        } catch (e) {
            console.error('Error parsing account data:', e);
            return;
        }

        // Find the time slot where the drop occurred
        const timeSlot = this.findTimeSlotFromEvent(event);
        if (timeSlot) {
            this.createCallForTimeSlot(accountInfo, timeSlot);
        }

        // Clean up
        const calendarEl = this.template.querySelector('.calendar');
        if (calendarEl) {
            calendarEl.classList.remove('drag-over');
        }
        this.clearTimeSlotHighlight();
    }

    findTimeSlotFromEvent(event) {
        // This is a simplified version - in reality, you'd need to map mouse coordinates
        // to FullCalendar's time slots. For now, we'll use a basic approach.
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Calculate approximate time based on position
        // This is a basic implementation - you might need to adjust based on FullCalendar's layout
        const timeSlotHeight = 48; // Approximate height of 30-minute slot
        const headerHeight = 60; // Approximate header height
        const dayWidth = rect.width / 7;
        
        const dayIndex = Math.floor(x / dayWidth);
        const slotIndex = Math.floor((y - headerHeight) / timeSlotHeight);
        
        if (dayIndex >= 0 && dayIndex < 7 && slotIndex >= 0) {
            const startHour = 8; // Based on slotMinTime
            const slotTime = startHour + (slotIndex * 0.5); // 30-minute slots
            
            // Get the date for the day
            const currentDate = new Date();
            const startOfWeek = new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay()));
            const targetDate = new Date(startOfWeek);
            targetDate.setDate(targetDate.getDate() + dayIndex);
            
            const startTime = new Date(targetDate);
            startTime.setHours(Math.floor(slotTime), (slotTime % 1) * 60, 0, 0);
            
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + 30);
            
            return {
                start: startTime,
                end: endTime,
                dayIndex: dayIndex,
                slotIndex: slotIndex
            };
        }
        
        return null;
    }

    highlightTimeSlot(timeSlot) {
        // Add visual highlighting to the time slot
        // This would need to be implemented based on FullCalendar's DOM structure
        console.log('Highlighting time slot:', timeSlot);
    }

    clearTimeSlotHighlight() {
        // Remove time slot highlighting
        console.log('Clearing time slot highlight');
    }

    async createCallForTimeSlot(accountInfo, timeSlot) {
        try {
            const startTimeStr = timeSlot.start.toISOString().slice(0, 19);
            const endTimeStr = timeSlot.end.toISOString().slice(0, 19);
            
            const callId = await createCall({
                accountId: accountInfo.id,
                accountName: accountInfo.name,
                startTime: startTimeStr,
                endTime: endTimeStr
            });
            
            // Add the event to the calendar
            const newEvent = {
                id: callId,
                title: `Call with ${accountInfo.name}`,
                start: timeSlot.start.toISOString(),
                end: timeSlot.end.toISOString(),
                backgroundColor: '#1589ee',
                borderColor: '#1589ee'
            };
            
            this.events.push(newEvent);
            this.calendar.addEvent(newEvent);
            
            // Show success toast
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: `Call scheduled with ${accountInfo.name}`,
                    variant: 'success'
                })
            );
            
        } catch (error) {
            console.error('Error creating call:', error);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'Failed to schedule call: ' + error.body?.message || error.message,
                    variant: 'error'
                })
            );
        }
    }

    // Legacy FullCalendar drop handlers (may not be needed)
    handleDrop(info) {
        console.log('FullCalendar drop:', info);
    }

    handleEventReceive(info) {
        console.log('FullCalendar event receive:', info);
    }

    setupDropZones(info) {
        console.log('FullCalendar day header mounted:', info);
    }
}
