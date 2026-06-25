#include "runtime.h"

typedef struct { int32_t _state; int32_t i; bool _done; int32_t _value; } counter_state;
typedef struct { int32_t value; bool done; } counter_result;

static counter_result counter_next(counter_state *self, int32_t start) {
    switch (self->_state) {
        case 0:
            self->i = start;
case_1:
        case 1:
            if (!(true)) { self->_done = true; return (counter_result){0, true}; }
            self->_value = self->i;
            self->_state = 2;
            return (counter_result){self->_value, false};
        case 2:
            self->i = self->i + 1;
            self->_state = 1;
            goto case_1;
    }
    return (counter_result){0, true};
}

int main(void) {
    TSC_INIT();
    counter_state gen = {0};
    counter_result _r_0 = counter_next(&gen, 1);
    printf("%d\n", _r_0.value);
    counter_result _r_1 = counter_next(&gen, 1);
    printf("%d\n", _r_1.value);
    counter_result _r_2 = counter_next(&gen, 1);
    printf("%d\n", _r_2.value);
    return 0;
}
