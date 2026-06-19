#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t n; } doBreak_state;

static void doBreak_poll(doBreak_state *self) {
    switch (self->_state) {
        case 0:
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            i = i + 1;
            if (i >= self->n) goto dowhile_1_end;
dowhile_1_cont:
            if (i < 100) {
                self->_state = 1;
                goto case_1;
            }
dowhile_1_end:
            self->_result = i;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
