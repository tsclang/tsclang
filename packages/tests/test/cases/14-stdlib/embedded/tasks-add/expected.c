#include "runtime.h"
#include "std/embedded.h"

typedef void (*TaskPollFn)(void *state);
typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;
typedef struct { TscTask _slots[2]; size_t _count; } Tasks_2;

typedef struct { int32_t _state; bool _done; } ledTask_state;
typedef struct { int _dummy; bool done; } ledTask_result;

static ledTask_result ledTask_next(ledTask_state *self) {
    switch (self->_state) {
        case 0:
            self->_state = 1;
            return (ledTask_result){0, false};
        case 1:
            self->_done = true;
            return (ledTask_result){0, true};
    }
    return (ledTask_result){0, true};
}

static void ledTask_poll(void *state) {
    ledTask_next((ledTask_state *)state);
}

int main(void) {
    TSC_INIT();
    Tasks_2 tasks = {0};
    static ledTask_state _ledTask_state_0 = {0};
    tsc_tasks_add(&tasks, STR_LIT("led"), ledTask_poll, &_ledTask_state_0);
    return 0;
}
