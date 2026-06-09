#include "runtime.h"

typedef enum { Seq_X = 0b00, Seq_Y = 0b01, Seq_Z = 0b10 } Seq;
static const Seq Seq_values[] = { Seq_X, Seq_Y, Seq_Z };
static const char *Seq_names[] = { "X", "Y", "Z" };

int main(void) {
    TSC_INIT();
    printf("%s\n", Seq_names[(int)Seq_Y]);
    printf("%s\n", Seq_names[(int)Seq_Z]);
    return 0;
}
