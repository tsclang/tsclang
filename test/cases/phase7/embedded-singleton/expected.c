#include "runtime.h"

typedef struct { int32_t _state; int32_t n; bool _done; int32_t _value; } counter_state;
typedef struct { int32_t value; bool done; } counter_result;

static counter_result counter_next(counter_state *self) {
    switch (self->_state) {
        case 0:
            self->n = 0;
case_1:
        case 1:
            if (!(true)) { self->_done = true; return (counter_result){0, true}; }
            self->_value = self->n;
            self->_state = 2;
            return (counter_result){self->_value, false};
        case 2:
            self->n = self->n + 1;
            self->_state = 1;
            goto case_1;
    }
    return (counter_result){0, true};
}

static counter_state _counter_instance;

int main(void) {
    TSC_INIT();
    return 0;
}
