#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } getVal_state;

static void getVal_poll(getVal_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int32_t _result; bool _done; } findFor_state;

static void findFor_poll(findFor_state *self) {
    switch (self->_state) {
        case 0:
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < 10)) { goto for_1_end; }
            self->_await_0 = (getVal_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            getVal_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result;
            if (v == 42) goto for_1_end;
for_1_cont:
            i = i + 1;
            if (!(i < 10)) { goto for_1_end; }
            self->_state = 1;
            goto case_1;
for_1_end:
            self->_result = 0;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
