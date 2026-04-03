#include "runtime.h"
#include "std/embedded.h"

typedef void (*TaskPollFn)(void *state);
typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;
typedef struct { TscTask _slots[1]; size_t _count; } Tasks_1;

typedef struct { int32_t _state; bool _done; } blink_state;
typedef struct { int _dummy; bool done; } blink_result;

static blink_result blink_next(blink_state *self) {
    switch (self->_state) {
        case 0: self->_state = 1; return (blink_result){0, false};
        case 1: self->_done = true; return (blink_result){0, true};
    }
    return (blink_result){0, true};
}

static void blink_poll(void *state) {
    blink_next((blink_state *)state);
}

int main(void) {
    TSC_INIT();
    Tasks_1 tasks = {0};
    static blink_state _blink_state_0 = {0};
    tsc_tasks_add(&tasks, STR_LIT("blink"), blink_poll, &_blink_state_0);
    tsc_tasks_run(&tasks);
    return 0;
}
