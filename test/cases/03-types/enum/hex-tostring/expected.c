#include "runtime.h"

typedef enum { Flags_Read = 0x01, Flags_Write = 0x02, Flags_Exec = 0x04 } Flags;
static const Flags Flags_values[] = { Flags_Read, Flags_Write, Flags_Exec };
static const char *Flags_toString(Flags v) {
    switch (v) {
        case Flags_Read: return "Read";
        case Flags_Write: return "Write";
        case Flags_Exec: return "Exec";
        default: return "unknown";
    }
}

int main(void) {
    TSC_INIT();
    printf("%s\n", Flags_toString(Flags_Read));
    printf("%s\n", Flags_toString(Flags_Write));
    printf("%s\n", Flags_toString(Flags_Exec));
    return 0;
}
