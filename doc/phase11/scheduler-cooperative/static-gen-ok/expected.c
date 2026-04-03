#include "runtime.h"

typedef struct { int32_t _state; bool _done; } blink_state;
typedef struct { int _dummy; bool done; } blink_result;

static blink_result blink_next(blink_state *self) {
    switch (self->_state) {
        case 0: self->_state = 1; return (blink_result){0, false};
        case 1: self->_done = true; return (blink_result){0, true};
    }
    return (blink_result){0, true};
}

static blink_state _blink_instance;

int main(void) {
    TSC_INIT();
    return 0;
}
