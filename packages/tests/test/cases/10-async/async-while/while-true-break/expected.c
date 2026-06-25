#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t n; } countTo_state;

static void countTo_poll(countTo_state *self) {
    switch (self->_state) {
        case 0:
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(true)) { goto while_1_end; }
            i = i + 1;
            if (i >= self->n) goto while_1_end;
            self->_state = 1;
            goto case_1;
while_1_end:
            self->_result = i;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
