/*
 * Copyright (C) 2012 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
({
    doInit: function(component, event, helper) {
        for (var i = 0; i < 42; i++) {
            var cellCmp = component.find(i);
            if (cellCmp) {
                cellCmp.addHandler("click", component, "c.handleClick");
                cellCmp.addHandler("keydown", component, "c.handleKeydown");
            }
        }
    },
    
    handleClick: function(component, event, helper) {
        helper.selectDate(component, event);
    },
    
    handleKeydown: function(component, event, helper) {
        helper.handleKeydown(component, event);
    },
    
    updateCalendar: function(component, event, helper) {
        var date = component.get("v.date");
        if (!date) {
            date = 1;
        }
        var monthChange = event.getParam("monthChange");
        var yearChange = event.getParam("yearChange");
        helper.changeMonthYear(component, monthChange, yearChange, date);
    }
})