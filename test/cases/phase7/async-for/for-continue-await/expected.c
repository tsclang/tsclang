#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } poll_state;

static void poll_poll(poll_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 1;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    int32_t count;
    poll_state _await_0;
} skipFor_state;

static void skipFor_poll(skipFor_state *self) {
    switch (self->_state) {
        case 0:
            self->count = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < 5)) { goto for_1_end; }
            self->_await_0 = (poll_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            poll_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result;
            if (v == 0) goto for_1_cont;
            self->count = self->count + 1;
for_1_cont:
            i = i + 1;
            if (!(i < 5)) { goto for_1_end; }
            self->_state = 1;
            goto case_1;
for_1_end:
            self->_result = self->count;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
