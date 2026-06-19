#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t n; } sumFor_state;

static void sumFor_poll(sumFor_state *self) {
    switch (self->_state) {
        case 0:
            int32_t total = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < 100)) { goto for_1_end; }
            total = (int32_t)((uint32_t)total + (uint32_t)i);
            if (i >= self->n) goto for_1_end;
for_1_cont:
            i = i + 1;
            if (!(i < 100)) { goto for_1_end; }
            self->_state = 1;
            goto case_1;
for_1_end:
            self->_result = total;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
