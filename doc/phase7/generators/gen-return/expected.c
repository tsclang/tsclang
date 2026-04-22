#include "runtime.h"

typedef struct { int32_t _state; int32_t i; bool _done; int32_t _value; } limited_state;
typedef struct { int32_t value; bool done; } limited_result;

static limited_result limited_next(limited_state *self, int32_t max) {
    switch (self->_state) {
        case 0:
            self->i = 0;
case_1:
        case 1:
            if (!(self->i < max)) { self->_done = true; return (limited_result){0, true}; }
            self->_value = self->i;
            self->_state = 2;
            return (limited_result){self->_value, false};
        case 2:
            self->i += 1;
            self->_state = 1;
            goto case_1;
    }
    return (limited_result){0, true};
}

int main(void) {
    TSC_INIT();
    limited_state g = {0};
    limited_result r = limited_next(&g, 3);
    while (!r.done) {
        printf("%d\n", r.value);
        r = limited_next(&g, 3);
    }
    return 0;
}
