import { LightningElement, track } from 'lwc';
import FULL_CALENDAR from '@salesforce/resourceUrl/fullCalendar';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { NavigationMixin } from 'lightning/navigation';
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

export default class LibsFullCalendar extends NavigationMixin(LightningElement) {
    isCalInitialized = false;
    error;
    calendar;
    @track events = [];
    draggedAccount = null;
    currentHighlightedSlot = null;

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
            eventClick: this.handleEventClick.bind(this),
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
        // Get the time grid element for more accurate positioning
        const timeGridElement = this.template.querySelector('.fc-timegrid-body');
        if (!timeGridElement) return null;
        
        const rect = timeGridElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // More accurate calculations based on FullCalendar's actual structure
        const timeSlotHeight = 48; // Height of 30-minute slot in FullCalendar
        const dayWidth = rect.width / 7; // Width of each day column
        
        const dayIndex = Math.floor(x / dayWidth);
        const slotIndex = Math.floor(y / timeSlotHeight);
        
        if (dayIndex >= 0 && dayIndex < 7 && slotIndex >= 0) {
            const startHour = 8; // Based on slotMinTime
            const slotTime = startHour + (slotIndex * 0.5); // 30-minute slots
            
            // Get the current calendar view's date range
            const currentView = this.calendar.view;
            const startOfWeek = currentView.activeStart;
            
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
                slotIndex: slotIndex,
                slotElement: this.findSlotElement(dayIndex, slotIndex)
            };
        }
        
        return null;
    }

    findSlotElement(dayIndex, slotIndex) {
        // Find the actual DOM element for the time slot
        const slotSelector = `.fc-timegrid-slot[data-time="${this.formatSlotTime(8 + (slotIndex * 0.5))}"]`;
        const dayColumn = this.template.querySelector(`.fc-day[data-date]:nth-child(${dayIndex + 1})`);
        
        if (dayColumn) {
            return dayColumn.querySelector(slotSelector);
        }
        
        // Fallback: find by position
        const allSlots = this.template.querySelectorAll('.fc-timegrid-slot');
        const targetSlotIndex = (dayIndex * 20) + slotIndex; // 20 slots per day (8AM-6PM, 30min each)
        return allSlots[targetSlotIndex] || null;
    }

    formatSlotTime(hours) {
        const hour = Math.floor(hours);
        const minutes = (hours % 1) * 60;
        return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    }

    highlightTimeSlot(timeSlot) {
        // Clear previous highlight
        this.clearTimeSlotHighlight();
        
        if (timeSlot && timeSlot.slotElement) {
            timeSlot.slotElement.classList.add('slot-highlight');
            this.currentHighlightedSlot = timeSlot.slotElement;
        } else {
            // Fallback: find and highlight the slot using a more generic approach
            const allSlots = this.template.querySelectorAll('.fc-timegrid-slot');
            const dayColumns = this.template.querySelectorAll('.fc-day');
            
            if (dayColumns[timeSlot.dayIndex]) {
                const daySlots = dayColumns[timeSlot.dayIndex].querySelectorAll('.fc-timegrid-slot');
                if (daySlots[timeSlot.slotIndex]) {
                    daySlots[timeSlot.slotIndex].classList.add('slot-highlight');
                    this.currentHighlightedSlot = daySlots[timeSlot.slotIndex];
                }
            }
        }
    }

    clearTimeSlotHighlight() {
        // Remove highlighting from previously highlighted slot
        if (this.currentHighlightedSlot) {
            this.currentHighlightedSlot.classList.remove('slot-highlight');
            this.currentHighlightedSlot = null;
        }
        
        // Also remove from any slots that might have the class
        const highlightedSlots = this.template.querySelectorAll('.slot-highlight');
        highlightedSlots.forEach(slot => {
            slot.classList.remove('slot-highlight');
        });
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
                title: accountInfo.name, // Show only account name
                start: timeSlot.start.toISOString(),
                end: timeSlot.end.toISOString(),
                backgroundColor: '#1589ee',
                borderColor: '#1589ee',
                extendedProps: {
                    accountId: accountInfo.id,
                    accountName: accountInfo.name,
                    callId: callId
                }
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

    // Event click handler to navigate to Call record
    handleEventClick(info) {
        const event = info.event;
        const callId = event.id;
        
        if (callId) {
            // Navigate to the Call record page
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: callId,
                    objectApiName: 'Calls__c',
                    actionName: 'view'
                }
            });
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
