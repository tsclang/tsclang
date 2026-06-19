#include "runtime.h"
#include "std/embedded.h"

typedef void (*TaskPollFn)(void *state);
typedef struct { TaskPollFn fn; void *state; bool active; String name; } TscTask;
typedef struct { TscTask _slots[4]; size_t _count; } Tasks_4;

int main(void) {
    TSC_INIT();
    Tasks_4 tasks = {0};
    return 0;
}
