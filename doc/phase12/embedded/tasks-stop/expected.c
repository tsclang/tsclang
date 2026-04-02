#include "runtime.h"
#include "std/embedded.h"

typedef void (*TaskPollFn)(void *state);
typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;
typedef struct { TscTask _slots[2]; size_t _count; } Tasks_2;

typedef struct { int32_t _state; bool _done; } work_state;
typedef struct { int _dummy; bool done; } work_result;

static work_result work_next(work_state *self) {
    switch (self->_state) {
        case 0: self->_state = 1; return (work_result){0, false};
        case 1: self->_done = true; return (work_result){0, true};
    }
    return (work_result){0, true};
}

static void work_poll(void *state) {
    work_next((work_state *)state);
}

int main(void) {
    TSC_INIT();
    Tasks_2 tasks = {0};
    static work_state _work_state_0 = {0};
    tsc_tasks_add(&tasks, STR_LIT("work"), work_poll, &_work_state_0);
    tsc_tasks_stop(&tasks, STR_LIT("work"));
    return 0;
}
