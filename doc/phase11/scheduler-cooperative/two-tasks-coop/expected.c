#include "runtime.h"

typedef struct { int32_t _state; int _result; bool _done; } taskA_state;
static void taskA_poll(taskA_state *self) {
    switch (self->_state) {
        case 0: printf("A\n"); self->_done = true; return;
    }
}
static taskA_state _taskA_instance;

typedef struct { int32_t _state; int _result; bool _done; } taskB_state;
static void taskB_poll(taskB_state *self) {
    switch (self->_state) {
        case 0: printf("B\n"); self->_done = true; return;
    }
}
static taskB_state _taskB_instance;

int main(void) {
    TSC_INIT();
    while (!_taskA_instance._done || !_taskB_instance._done) {
        if (!_taskA_instance._done) taskA_poll(&_taskA_instance);
        if (!_taskB_instance._done) taskB_poll(&_taskB_instance);
    }
    return 0;
}
