#include "runtime.h"

typedef struct { int32_t _state; int _result; bool _done; } task_state;

static void task_poll(task_state *self) {
    switch (self->_state) {
        case 0:
            printf("tick\n");
            self->_done = true;
            return;
    }
}

static task_state _task_instance;

int main(void) {
    TSC_INIT();
    while (!_task_instance._done) {
        task_poll(&_task_instance);
    }
    return 0;
}
