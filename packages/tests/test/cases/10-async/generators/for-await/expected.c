#include "runtime.h"

typedef struct { int32_t _state; bool _done; int32_t _value; } nums_state;
typedef struct { int32_t value; bool done; } nums_result;

static nums_result nums_next(nums_state *self) {
    switch (self->_state) {
        case 0:
            self->_state = 1;
            return (nums_result){10, false};
        case 1:
            self->_state = 2;
            return (nums_result){20, false};
        case 2:
            self->_state = 3;
            return (nums_result){30, false};
        case 3:
            self->_done = true;
            return (nums_result){0, true};
    }
    return (nums_result){0, true};
}

typedef struct { int32_t _state; int _result; bool _done; nums_state _gen_0; } main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            self->_gen_0 = (nums_state){0};
            self->_state = 1;
            /* fall through */
case_1:
        case 1: {
                nums_result _nr_0 = nums_next(&self->_gen_0);
                if (_nr_0.done) { self->_done = true; return; }
                const int32_t n = _nr_0.value;
                printf("%d\n", n);
                goto case_1;
        }
    }
}

int main(void) {
    TSC_INIT();
    main_state _main_sm = {0};
    while (!_main_sm._done) {
        main_poll(&_main_sm);
    }
    return 0;
}
