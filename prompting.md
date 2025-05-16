I want to create a productivity web application tool that exactly replicates the UI shown in the attached screenshots. You must use only HTML for structure, CSS for styling without any libraries, and JavaScript for functionality, with all code containing in a single HTML file. The UI must match the screenshots precisely and accurately in terms of components, colors, layout, and fonts, with no extras unless explicitly requested. 

The web app's main layout must feature a cenetered search bar at the top. To the right of the search bar, place an 'Add Task' button as exactly shown in the screenshot with plus icon and the button's color is #4f2193 and this is the way users can add tasks and no extra buttons or methods are allowed. And before the 'Add Task' button, place tag based filters button with options like 'Work', 'School', 'Health+fitness', 'Exercise', and 'Creativity', which must filter the tasks rendered below based on the selected tags. The buttons MUST have same icon as shown in the screenshot. Using icons from the screenshot is mandatory and unless specified explicitly, the icons and colors must be exactly as shown in the screenshot. The search section should have a border and a light drop shadow beneath it. Below the search section, arrange three main sections: Habits, Dailies, and Todos in a responsive grid or flexbox, with spacing, alignment, and sizing identical to the screenshots. Each section must include filtering tabs: 'All', 'Weak', 'Strong' for Habits; 'All', 'Due', 'Not Due' for Dailies, and 'Active', 'Scheduled', 'Complete' for Todos. These tabs must actively filter the tasks shown in each section. 

As a functional change, remove the Rewards section entirely from the layout, adjusting the design to reflect this absence.

The webapp must include several features like when users click the 'Add Task' button, a modal should open for adding a new task which will first prompt the user to select the type of task from a dropdown menu with options like 'Habit', 'Daily', and 'Todo'. Once the user selects the type of task, the respective task modals must open up to take the inputs. modal should have fields tailored to each section: for Habits, include Title (required/mandatory), Notes, Difficulty dropdown (Easy: 2 stars, Medium: 3 stars, Hard: 5 stars), Tags (selectable from the filter list), and Reset counter (Daily, Weekly, Monthly); for Dailies, include Title (required), Notes, Checklist items (addable and removable), Difficulty, Tags, and Repeats (ex: Every day, Weekdays, Specific days); for Todos, include Title (required), Notes, Difficulty, Tags, and an optional Due date.

Clicking a task should open a similar modal for editing or deleting it, and positioning the items top and bottom triggered by three dots that appear when hovering over the task. In Dailies, checklist items must be toggleable (ex: checking/unchecking updates their state), and selecting a filter tab (ex:, Due for Dailies) must update the displayed tasks. Task counters (showing the number of tasks per section or status) must update in realtime based on user actions like adding or completing tasks, with all data persisting via local storage.

Apply only specific styling to match the UI exactly in the screenshots. Use Roboto Condensed for section headers and for task titles and Robot for descriptions. Colors must be exact: #EDECEE for component backgrounds, #FFBE5D for task card edges, #F9F9F9 for the base background, and #6133B4 with white for modals. When hovering over a task, display a cursor pointer and a violet border around it; when hovering over a task tag icon, show its associated tags. Modals should overlay the screen with a subtle background blur effect. The application must be fully responsive, adapting seamlessly to both mobile and web screen sizes.

Ensure full accessibility by supporting keyboard navigation (for ex:, tabbing through tasks and modals) and adding ARIA labels for screen readers. When hovering on a task, render three dots that, when clicked, allow users to edit, delete, or move the task to the top or bottom of its list. Checklist items in Dailies must support adding, removing, and toggling functionality, with their states saved.


Finally The UI and behavior must be pixel perfect, adhering strictly to the screenshots provided with no missing elements or extra features beyond what’s explicitly requested. All things, such as modal operations, filtering, and counter updates, must function as described. The attached screenshots (at least two, as required for Hard difficulty) provide the exact reference, and the implementation must reflect these without any ambiguity.


TODO - fourteen may:
- Whatsapp relogin flow, need to send a property (like login_type = 'relogin' in connectWhatsapp method to ensure that inmemory flag in the class code doesnt interrupt login process by immediatly ending it) in API. 
- Testing every reconnection logical flow
- Deployed both instagram and linkedin backend bridges but before developing backend for either of them:
- Instagram login process loop hole figure out (CURL or cookie fetch) ???

- Linkedin login also has a loop hole. Programmatically extracting LinkedIn cookies is feasible using tools like Puppeteer, and can replicate the private window recommendation with incognito mode or session clearing. However, need to navigate potential security measures and ToS concerns carefully. With the right setup, it’s a practical alternative to manual extraction.

- Both have a chance of security risk, need to figure out regarding these.


