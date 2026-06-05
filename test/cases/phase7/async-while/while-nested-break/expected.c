#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } nestedBreak_state;

static void nestedBreak_poll(nestedBreak_state *self) {
    switch (self->_state) {
        case 0:
            int32_t sum = 0;
            int32_t i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(i < 3)) { goto while_1_end; }
            int32_t j = 0;
            self->_state = 2;
            /* fall through */
case_2:
        case 2:
            if (!(j < 3)) { goto while_2_end; }
            sum = sum + 1;
            if (j == 1) goto while_2_end;
            j = j + 1;
            self->_state = 2;
            goto case_2;
while_2_end:
            i = i + 1;
            self->_done = true;
            return;
while_1_end:
            self->_result = sum;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
