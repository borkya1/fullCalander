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
            slotLabelInterval: '01:00:00',
            slotHeight: 60,
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
        // Try multiple elements to find the correct calendar grid
        let timeGridElement = this.template.querySelector('.fc-timegrid-body');
        if (!timeGridElement) {
            timeGridElement = this.template.querySelector('.fc-scrollgrid-sync-table');
        }
        if (!timeGridElement) {
            timeGridElement = this.template.querySelector('.fc-timegrid');
        }
        if (!timeGridElement) {
            // Fallback to the main calendar element
            timeGridElement = this.template.querySelector('.calendar');
        }
        
        if (!timeGridElement) {
            console.warn('Could not find calendar grid element');
            return null;
        }
        
        const rect = timeGridElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Debug logging
        console.log('Mouse coordinates:', { x, y, clientX: event.clientX, clientY: event.clientY });
        console.log('Grid element rect:', rect);
        
        // Updated calculations for larger slots (60px height)
        const timeSlotHeight = 60; // Updated to match new slot height
        const timeAxisWidth = 70; // Width of the time axis on the left
        const availableWidth = rect.width - timeAxisWidth;
        const dayWidth = availableWidth / 7; // Width of each day column
        
        // Adjust x coordinate to account for time axis
        const adjustedX = x - timeAxisWidth;
        
        const dayIndex = Math.floor(adjustedX / dayWidth);
        const slotIndex = Math.floor(y / timeSlotHeight);
        
        console.log('Calculated indices:', { dayIndex, slotIndex, adjustedX, dayWidth, timeSlotHeight });
        
        // Validate the coordinates are within bounds
        if (dayIndex >= 0 && dayIndex < 7 && slotIndex >= 0 && slotIndex < 20) { // 20 slots (8AM-6PM, 30min each)
            const startHour = 8; // Based on slotMinTime
            const slotTime = startHour + (slotIndex * 0.5); // 30-minute slots
            
            // Validate time is within business hours
            if (slotTime >= 8 && slotTime < 18) {
                // Get the current calendar view's date range
                const currentView = this.calendar.view;
                const startOfWeek = currentView.activeStart;
                
                const targetDate = new Date(startOfWeek);
                targetDate.setDate(targetDate.getDate() + dayIndex);
                
                const startTime = new Date(targetDate);
                startTime.setHours(Math.floor(slotTime), (slotTime % 1) * 60, 0, 0);
                
                const endTime = new Date(startTime);
                endTime.setMinutes(endTime.getMinutes() + 30);
                
                console.log('Valid time slot found:', { startTime, endTime, dayIndex, slotIndex });
                
                return {
                    start: startTime,
                    end: endTime,
                    dayIndex: dayIndex,
                    slotIndex: slotIndex,
                    slotElement: this.findSlotElement(dayIndex, slotIndex)
                };
            }
        }
        
        console.log('No valid time slot found for coordinates');
        return null;
    }

    findSlotElement(dayIndex, slotIndex) {
        // Multiple strategies to find the time slot element
        
        // Strategy 1: Find by time and day
        const timeStr = this.formatSlotTime(8 + (slotIndex * 0.5));
        let slotElement = this.template.querySelector(`.fc-timegrid-slot[data-time="${timeStr}"]`);
        
        if (slotElement) {
            console.log('Found slot by time selector:', timeStr);
            return slotElement;
        }
        
        // Strategy 2: Find by row and column structure
        const timeGridRows = this.template.querySelectorAll('.fc-timegrid-slot-lane');
        if (timeGridRows[slotIndex]) {
            const dayCells = timeGridRows[slotIndex].querySelectorAll('.fc-timegrid-col');
            if (dayCells[dayIndex + 1]) { // +1 to account for time axis column
                console.log('Found slot by row/column structure');
                return dayCells[dayIndex + 1];
            }
        }
        
        // Strategy 3: Find all slots and calculate position
        const allSlots = this.template.querySelectorAll('.fc-timegrid-slot');
        if (allSlots.length > 0) {
            // Each time slot row has 8 elements (1 time label + 7 days)
            const targetSlotIndex = (slotIndex * 8) + (dayIndex + 1);
            if (allSlots[targetSlotIndex]) {
                console.log('Found slot by calculated index:', targetSlotIndex);
                return allSlots[targetSlotIndex];
            }
        }
        
        // Strategy 4: Generic fallback - highlight any slot in the general area
        const timeSlots = this.template.querySelectorAll('.fc-timegrid-slot');
        if (timeSlots.length > 0 && slotIndex < timeSlots.length) {
            console.log('Using fallback slot highlighting');
            return timeSlots[Math.min(slotIndex, timeSlots.length - 1)];
        }
        
        console.warn('Could not find slot element for:', { dayIndex, slotIndex });
        return null;
    }

    formatSlotTime(hours) {
        const hour = Math.floor(hours);
        const minutes = (hours % 1) * 60;
        return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    }

    highlightTimeSlot(timeSlot) {
        // Clear previous highlight
        this.clearTimeSlotHighlight();
        
        if (!timeSlot) return;
        
        console.log('Attempting to highlight time slot:', timeSlot);
        
        // Try to highlight the specific slot element
        if (timeSlot.slotElement) {
            timeSlot.slotElement.classList.add('slot-highlight');
            this.currentHighlightedSlot = timeSlot.slotElement;
            console.log('Highlighted specific slot element');
            return;
        }
        
        // Fallback 1: Add a visual indicator to the calendar container with positioning
        const calendarEl = this.template.querySelector('.calendar');
        if (calendarEl) {
            // Remove any existing highlight overlays
            const existingOverlay = calendarEl.querySelector('.slot-highlight-overlay');
            if (existingOverlay) {
                existingOverlay.remove();
            }
            
            // Create a highlight overlay
            const overlay = document.createElement('div');
            overlay.className = 'slot-highlight-overlay';
            overlay.style.cssText = `
                position: absolute;
                background-color: rgba(21, 137, 238, 0.3);
                border: 3px solid #1589ee;
                pointer-events: none;
                z-index: 100;
                border-radius: 6px;
                box-shadow: 0 0 12px rgba(21, 137, 238, 0.6);
            `;
            
            // Try to position it based on the calendar structure
            const timeGridElement = this.template.querySelector('.fc-timegrid-body') || 
                                  this.template.querySelector('.fc-scrollgrid-sync-table') ||
                                  calendarEl;
            
            if (timeGridElement) {
                const rect = timeGridElement.getBoundingClientRect();
                const calendarRect = calendarEl.getBoundingClientRect();
                
                const timeAxisWidth = 70;
                const availableWidth = rect.width - timeAxisWidth;
                const dayWidth = availableWidth / 7;
                const slotHeight = 60;
                
                const left = timeAxisWidth + (timeSlot.dayIndex * dayWidth);
                const top = timeSlot.slotIndex * slotHeight;
                
                overlay.style.left = left + 'px';
                overlay.style.top = top + 'px';
                overlay.style.width = dayWidth + 'px';
                overlay.style.height = slotHeight + 'px';
                
                timeGridElement.style.position = 'relative';
                timeGridElement.appendChild(overlay);
                
                this.currentHighlightedSlot = overlay;
                console.log('Created highlight overlay at position:', { left, top, dayWidth, slotHeight });
                return;
            }
        }
        
        // Fallback 2: Highlight any available slot as a visual indicator
        const allSlots = this.template.querySelectorAll('.fc-timegrid-slot');
        if (allSlots.length > 0) {
            const fallbackSlot = allSlots[Math.min(timeSlot.slotIndex || 0, allSlots.length - 1)];
            if (fallbackSlot) {
                fallbackSlot.classList.add('slot-highlight');
                this.currentHighlightedSlot = fallbackSlot;
                console.log('Used fallback slot highlighting');
            }
        }
    }

    clearTimeSlotHighlight() {
        // Remove highlighting from previously highlighted slot
        if (this.currentHighlightedSlot) {
            if (this.currentHighlightedSlot.classList) {
                this.currentHighlightedSlot.classList.remove('slot-highlight');
            }
            
            // If it's an overlay element, remove it
            if (this.currentHighlightedSlot.className === 'slot-highlight-overlay') {
                this.currentHighlightedSlot.remove();
            }
            
            this.currentHighlightedSlot = null;
        }
        
        // Remove any existing highlight overlays
        const overlays = this.template.querySelectorAll('.slot-highlight-overlay');
        overlays.forEach(overlay => overlay.remove());
        
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
